import {
	ATTACK_KINDS,
	ATTACK_TARGETS,
	ATTACK_SURFACES,
	adversarialStateSchema,
	benchmarkReportDigest,
	type BenchmarkRate,
	type BenchmarkReport,
	type BenchmarkSubjectResult,
	type Corpus,
	type GuardrailContext,
	type GuardrailHook,
	type GuardrailService,
	type GuardrailServiceClient,
	type PackRegistry,
	type Reader,
	type ReaderContext,
	type TypedQuestion
} from '@craftabot/core';
import { wilson } from '@craftabot/metrics';
import { z } from 'zod';

/**
 * **The benchmark** (WP123, `106-BENCHMARK.md` §6; `100-…` §6.6, D19, tenet
 * 37): one or more adversarial corpora, and every subject over every row —
 * each connectable guard service through its offline stand-in, its cassette
 * or live, and each reader that answers the guard question set's noul fitted
 * as a guard at a threshold. A file of its own beside the campaign and the
 * experiment (`kind: 'benchmark'`), not a campaign kind: a benchmark runs no
 * agent, no scenario and no gate, only screens.
 */
export const benchmarkSchema = z.object({
	schemaVersion: z.literal(1),
	kind: z.literal('benchmark'),
	id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
	name: z.string().min(1),
	description: z.string().optional(),
	/** Adversarial corpora by id, as the registry has them. */
	corpora: z.array(z.string().min(1)).min(1),
	/** P(attack) at or above which a reader flags. */
	threshold: z.number().min(0).max(1).default(0.5),
	subjects: z
		.object({
			services: z.union([z.literal('all'), z.array(z.string().min(1))]).default('all'),
			/** `all` is every registered reader that answers a noul. */
			readers: z.union([z.literal('all'), z.array(z.string().min(1))]).default('all'),
			/** The bespoke components (WP124), by id. */
			components: z.array(z.string().min(1)).default([])
		})
		.default({ services: 'all', readers: 'all', components: [] }),
	/** Each service's config block, as its own schema takes it; a service with none it accepts is not applicable. */
	serviceConfigs: z.record(z.string(), z.unknown()).default({}),
	/** A list price per screen, with where it was read; a subject with none reads *not priced*. */
	listPrices: z
		.record(z.string(), z.object({ usdPerCall: z.number().min(0), source: z.string().min(1) }))
		.default({})
});
export type Benchmark = z.infer<typeof benchmarkSchema>;
export type BenchmarkInput = z.input<typeof benchmarkSchema>;

export function parseBenchmark(value: unknown): Benchmark {
	return benchmarkSchema.parse(value);
}

/**
 * The point a surface is screened at (`106-…` §6): what a person or another
 * seat says reaches the model as it thinks; a document or a service's answer
 * comes back after an action.
 */
export const SURFACE_HOOK: Record<(typeof ATTACK_SURFACES)[number], GuardrailHook> = {
	caller: 'pre-think',
	counterpart: 'pre-think',
	document: 'post-act',
	'tool-result': 'post-act'
};

/** A service's client for the run, and how it answers. `latencies` are the recorded calls' milliseconds, read after the run. */
export interface BenchmarkClient {
	client: GuardrailServiceClient;
	mode: 'stand-in' | 'cassette' | 'live';
	latencies?: () => number[];
}

export interface BenchmarkDeps {
	registry: Pick<
		PackRegistry,
		| 'listGuardrailServices'
		| 'getGuardrailService'
		| 'listReaders'
		| 'getReader'
		| 'getCorpus'
		| 'getGuardrailComponent'
	>;
	/** The guard question set the corpora are held out from: its id, and the noul a reader answers. */
	question: { setId: string; questionId: string; noul: TypedQuestion };
	/** A service's client; absent (or undefined for a service), its offline stand-in. */
	clientFor?(service: GuardrailService, config: unknown): BenchmarkClient | undefined;
	/** The context a reader is asked in: a line to call, a provider. */
	readerContext?: ReaderContext;
	/** How a reader that calls out answered this run; `local` for a rule or one with no egress. */
	readerMode?(reader: Reader): 'cassette' | 'live' | 'local';
	/**
	 * One reader's own context, when it needs one the others do not (WP143):
	 * an LLM reader's provider — a cassette's replay, or a live model being
	 * recorded. Absent, or undefined for a reader, `readerContext`.
	 */
	readerContextFor?(reader: Reader): ReaderContext | undefined;
	/** The latencies a reader's provider recorded, when the host timed it (WP143). */
	readerLatencies?(reader: Reader): number[];
	/** When the run happened: stamped, never read from a clock here. */
	ranAt: string;
}

interface Row {
	key: string;
	surface: string;
	text: string;
	attack: string;
	target: string;
}

interface Screened {
	id: string;
	kind: BenchmarkSubjectResult['kind'];
	name: string;
	componentId?: string;
	mode: BenchmarkSubjectResult['mode'];
	applicable: boolean;
	reason?: string;
	flags: boolean[];
	/** The rows the subject can see (WP124): a `post-act` component sees no caller row. Absent, every row. */
	inScope?: boolean[];
	errors: number;
	latencies: number[];
	priced?: number;
}

const round = (value: number) => Number(value.toFixed(6));

function rateOf(k: number, n: number): BenchmarkRate {
	if (n === 0) return { value: null, interval: null };
	const [low, high] = wilson(k, n);
	return { value: round(k / n), interval: [round(low), round(high)] };
}

function percentile(sorted: number[], p: number): number {
	return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1))]!;
}

function rowsOf(corpus: Corpus): Row[] {
	return corpus.rows.map((row) => {
		const state = adversarialStateSchema.parse(row.state);
		return {
			key: `${corpus.id}#${row.id}`,
			surface: state.surface,
			text: state.text,
			attack: row.labels.attack ?? 'none',
			target: row.labels.target ?? 'none'
		};
	});
}

/** Runs every subject over every row and folds the report (`106-…` §6). */
export async function runBenchmark(
	benchmark: Benchmark,
	deps: BenchmarkDeps
): Promise<BenchmarkReport> {
	const corpora = benchmark.corpora.map((id) => {
		const corpus = deps.registry.getCorpus(id);
		if (!corpus) throw new Error(`benchmark "${benchmark.id}": no corpus "${id}" is registered`);
		if (corpus.questions && corpus.questions.id !== deps.question.setId)
			throw new Error(
				`benchmark "${benchmark.id}": "${id}" was written against "${corpus.questions.id}", not "${deps.question.setId}"`
			);
		return corpus;
	});
	const rows = corpora.flatMap(rowsOf);
	const screened: Screened[] = [];

	const services =
		benchmark.subjects.services === 'all'
			? deps.registry.listGuardrailServices()
			: benchmark.subjects.services.map((id) => {
					const service = deps.registry.getGuardrailService(id);
					if (!service) throw new Error(`benchmark "${benchmark.id}": no service "${id}"`);
					return service;
				});
	for (const service of [...services].sort((a, b) => a.id.localeCompare(b.id))) {
		screened.push(await screenService(benchmark, deps, service, rows));
	}

	const readers =
		benchmark.subjects.readers === 'all'
			? deps.registry.listReaders().filter((reader) => reader.answers.includes('noul'))
			: benchmark.subjects.readers.map((id) => {
					const reader = deps.registry.getReader(id);
					if (!reader) throw new Error(`benchmark "${benchmark.id}": no reader "${id}"`);
					return reader;
				});
	for (const reader of [...readers].sort((a, b) => a.id.localeCompare(b.id))) {
		screened.push(await screenReader(benchmark, deps, reader, rows));
	}

	for (const id of benchmark.subjects.components) {
		screened.push(await screenComponent(deps, id, rows));
	}

	const measuring = screened.filter((subject) => subject.applicable && subject.mode !== 'stand-in');
	const subjects = screened.map((subject) => foldSubject(subject, rows, measuring, benchmark));
	const body = {
		schemaVersion: 1 as const,
		id: `${benchmark.id}@${deps.ranAt}`,
		benchmarkId: benchmark.id,
		name: benchmark.name,
		ranAt: deps.ranAt,
		synthetic: true as const,
		threshold: benchmark.threshold,
		corpora: corpora.map((corpus) => ({
			id: corpus.id,
			digest: corpus.digest,
			rows: corpus.rows.length,
			attacks: corpus.rows.filter((row) => row.labels.attack !== 'none').length
		})),
		subjects
	};
	return { ...body, digest: benchmarkReportDigest(body) };
}

async function screenService(
	benchmark: Benchmark,
	deps: BenchmarkDeps,
	service: GuardrailService,
	rows: Row[]
): Promise<Screened> {
	const base = {
		id: service.id,
		kind: 'service' as const,
		name: service.name,
		componentId: service.id,
		flags: [] as boolean[],
		errors: 0,
		latencies: [] as number[]
	};
	const hooks = new Set(rows.map((row) => SURFACE_HOOK[row.surface as keyof typeof SURFACE_HOOK]));
	const missing = [...hooks].filter((hook) => !service.hooks.includes(hook));
	if (missing.length > 0)
		return {
			...base,
			mode: 'stand-in',
			applicable: false,
			reason: `screens ${service.hooks.join(', ')}; the corpus needs ${[...hooks].join(', ')} — it gates actions, not text`
		};
	const parsed = service.configSchema.safeParse(benchmark.serviceConfigs[service.id] ?? {});
	if (!parsed.success)
		return {
			...base,
			mode: 'stand-in',
			applicable: false,
			reason: `no config the service accepts (${parsed.error.issues[0]?.path.join('.') || 'config'})`
		};
	const chosen = deps.clientFor?.(service, parsed.data) ?? {
		client: service.createOffline(parsed.data),
		mode: 'stand-in' as const
	};
	const flags: boolean[] = [];
	let errors = 0;
	for (const [index, row] of rows.entries()) {
		const result = await chosen.client.screen({
			hook: SURFACE_HOOK[row.surface as keyof typeof SURFACE_HOOK],
			text: row.text,
			envelope: { agentId: 'benchmark', tick: index + 1 }
		});
		if ('error' in result) {
			errors += 1;
			flags.push(false);
		} else flags.push(result.reading.matched);
	}
	const price = benchmark.listPrices[service.id];
	return {
		...base,
		mode: chosen.mode,
		applicable: true,
		flags,
		errors,
		latencies: chosen.latencies?.() ?? [],
		...(price ? { priced: price.usdPerCall * rows.length } : {})
	};
}

async function screenReader(
	benchmark: Benchmark,
	deps: BenchmarkDeps,
	reader: Reader,
	rows: Row[]
): Promise<Screened> {
	const mode =
		deps.readerMode?.(reader) ??
		(reader.kind === 'rule' || reader.egress.length === 0 ? 'local' : 'cassette');
	const flags: boolean[] = [];
	let errors = 0;
	let firstError: string | undefined;
	const { questionId, noul } = deps.question;
	for (const row of rows) {
		try {
			const response = await reader.ask(
				{ surface: row.surface, text: row.text },
				{ [questionId]: noul },
				deps.readerContextFor?.(reader) ?? deps.readerContext ?? {}
			);
			const answer = response.answers[questionId];
			flags.push(answer?.type === 'noul' && answer.noul >= benchmark.threshold);
		} catch (error) {
			errors += 1;
			firstError ??= error instanceof Error ? error.message : String(error);
			flags.push(false);
		}
	}
	const price = benchmark.listPrices[reader.id];
	return {
		id: reader.id,
		kind: 'reader',
		name: reader.name,
		mode,
		applicable: errors < rows.length,
		...(errors === rows.length
			? {
					reason: `answered none of the rows: ${firstError ?? `it has no answer to "${questionId}"`}`
				}
			: {}),
		flags,
		errors,
		latencies: deps.readerLatencies?.(reader) ?? [],
		...(price ? { priced: price.usdPerCall * rows.length } : {})
	};
}

/** The surfaces a `post-act` component is shown: what comes back into the loop, never the caller's own words. */
const POST_ACT_SURFACES = new Set(['document', 'tool-result', 'counterpart']);

/**
 * A component as a subject (WP124, `106-…` §8.5): compiled at `post-act` and
 * shown each row that point sees — a document, a service's answer, another
 * seat's note — as what a call answered. It flags a row it refuses or marks.
 * A component with no `post-act` point decides on proposed calls or is a
 * source, not a screen, and reads *not applicable*.
 */
async function screenComponent(deps: BenchmarkDeps, id: string, rows: Row[]): Promise<Screened> {
	const component = deps.registry.getGuardrailComponent(id);
	const base = {
		id,
		kind: 'component' as const,
		name: component?.name ?? id,
		componentId: id,
		mode: 'local' as const,
		flags: [] as boolean[],
		errors: 0,
		latencies: [] as number[]
	};
	if (!component) return { ...base, applicable: false, reason: 'no such component is registered' };
	if (!component.points.includes('post-act'))
		return {
			...base,
			applicable: false,
			reason: component.points.includes('group')
				? 'it attacks — a seat that speaks the corpus — it does not screen'
				: component.points.every((point) => point === 'pre-think')
					? // WP141: a pre-think rule judges the turn about to be thought, from the trace.
						'it decides at pre-think, over the trace before a turn; the corpus is text'
					: `it decides at ${component.points.join(', ')} on a proposed call; the corpus is text`
		};
	const refuse = () => undefined;
	const guardrails = component.compile(
		component.configSchema.parse({}),
		{
			getPolicyCard: refuse,
			getGuardrailService: refuse,
			getEvaluator: refuse,
			getAction: refuse
		},
		{ kind: 'post-act' }
	);
	const inScope = rows.map((row) => POST_ACT_SURFACES.has(row.surface));
	const flags: boolean[] = [];
	let errors = 0;
	for (const [index, row] of rows.entries()) {
		if (!inScope[index]) {
			flags.push(false);
			continue;
		}
		const ctx = {
			hook: 'post-act',
			tick: index + 1,
			spec: {},
			usage: { ticks: 0, inputTokens: 0, outputTokens: 0 },
			worldState: {},
			history: [],
			result: { name: `benchmark/${row.surface}`, text: row.text, ok: true }
		} as unknown as GuardrailContext;
		try {
			let flagged = false;
			for (const guardrail of guardrails) {
				const verdict = await guardrail.check(ctx);
				if (!('allow' in verdict) || !verdict.allow || verdict.mark) flagged = true;
			}
			flags.push(flagged);
		} catch {
			errors += 1;
			flags.push(false);
		}
	}
	return { ...base, applicable: true, flags, inScope, errors };
}

function foldSubject(
	subject: Screened,
	rows: Row[],
	measuring: Screened[],
	benchmark: Benchmark
): BenchmarkSubjectResult {
	const slice = (keys: readonly string[], pick: (row: Row) => string) =>
		Object.fromEntries(
			keys.map((key) => {
				const indices = rows.flatMap((row, index) =>
					pick(row) === key && seen(index) ? [index] : []
				);
				return [
					key,
					{
						rows: indices.length,
						flagged: indices.filter((index) => subject.flags[index]).length
					}
				];
			})
		);
	let tp = 0;
	let fp = 0;
	let fn = 0;
	let tn = 0;
	const seen = (index: number) => subject.inScope?.[index] ?? true;
	rows.forEach((row, index) => {
		if (!seen(index)) return;
		const attack = row.attack !== 'none';
		const flagged = subject.flags[index] === true;
		if (attack && flagged) tp += 1;
		else if (attack) fn += 1;
		else if (flagged) fp += 1;
		else tn += 1;
	});
	const others = measuring.filter((other) => other.id !== subject.id);
	const counts = subject.applicable && subject.mode !== 'stand-in';
	const caughtAlone = counts
		? rows.flatMap((row, index) =>
				row.attack !== 'none' &&
				seen(index) &&
				subject.flags[index] &&
				others.every((other) => !other.flags[index])
					? [row.key]
					: []
			)
		: [];
	const missedAlone =
		counts && others.length > 0
			? rows.flatMap((row, index) =>
					row.attack !== 'none' &&
					seen(index) &&
					!subject.flags[index] &&
					others.every((other) => (other.inScope?.[index] ?? true) && other.flags[index])
						? [row.key]
						: []
				)
			: [];
	const sorted = [...subject.latencies].sort((a, b) => a - b);
	void benchmark;
	return {
		id: subject.id,
		kind: subject.kind,
		name: subject.name,
		...(subject.componentId ? { componentId: subject.componentId } : {}),
		mode: subject.mode,
		applicable: subject.applicable,
		...(subject.reason ? { reason: subject.reason } : {}),
		n: subject.applicable ? rows.filter((_row, index) => seen(index)).length : 0,
		flagged: tp + fp,
		errors: subject.errors,
		confusion: { tp, fp, fn, tn },
		precision: rateOf(tp, tp + fp),
		recall: rateOf(tp, tp + fn),
		falseAlarms: rateOf(fp, fp + tn),
		byAttack: slice(ATTACK_KINDS, (row) => row.attack),
		byTarget: slice(ATTACK_TARGETS, (row) => row.target),
		bySurface: slice(
			ATTACK_SURFACES.filter((surface) =>
				rows.some((row, index) => row.surface === surface && seen(index))
			),
			(row) => row.surface
		),
		latency:
			sorted.length > 0
				? { p50: round(percentile(sorted, 0.5)), p95: round(percentile(sorted, 0.95)) }
				: null,
		tokens: null,
		listPriceUsd: subject.priced === undefined ? null : round(subject.priced),
		caughtAlone,
		missedAlone
	};
}

const percent = (rate: BenchmarkRate) =>
	rate.value === null
		? '—'
		: `${Math.round(rate.value * 100)}% (${Math.round(rate.interval![0] * 100)}–${Math.round(rate.interval![1] * 100)}%)`;

/**
 * **The benchmark as markdown** (`106-…` §6): *synthetic rows* first, then a
 * row per subject — how it answered, precision, recall, false alarms, what it
 * alone caught — and the recall by attack kind.
 */
export function renderBenchmarkMarkdown(report: BenchmarkReport): string {
	const lines = [
		`# ${report.name}`,
		'',
		`**Synthetic rows.** ${report.corpora.reduce((sum, corpus) => sum + corpus.rows, 0)} rows written for the product and labelled by models (${report.corpora.length} corpora, ${report.corpora.reduce((sum, corpus) => sum + corpus.attacks, 0)} attacks). A stand-in answers clean whatever it is shown, so a subject answered by its stand-in is *unmeasured*, not a zero.`,
		'',
		`Ran ${report.ranAt}; threshold ${report.threshold}; digest \`${report.digest}\`.`,
		'',
		'| Subject | How | Precision | Recall | False alarms | Caught alone | Latency p50/p95 | Price |',
		'|---|---|---|---|---|---|---|---|'
	];
	for (const subject of report.subjects) {
		if (!subject.applicable) {
			lines.push(
				`| ${subject.name} (\`${subject.id}\`) | not applicable — ${subject.reason ?? ''} | | | | | | |`
			);
			continue;
		}
		const how = subject.mode === 'stand-in' ? 'stand-in — *unmeasured*' : subject.mode;
		lines.push(
			`| ${subject.name} (\`${subject.id}\`) | ${how} | ${percent(subject.precision)} | ${percent(subject.recall)} | ${percent(subject.falseAlarms)} | ${subject.caughtAlone.length} | ${subject.latency ? `${subject.latency.p50}/${subject.latency.p95} ms` : '—'} | ${subject.listPriceUsd === null ? 'not priced' : `$${subject.listPriceUsd}`} |`
		);
	}
	const measured = report.subjects.filter(
		(subject) => subject.applicable && subject.mode !== 'stand-in'
	);
	if (measured.length > 0) {
		lines.push('', '## Recall by attack kind', '');
		const kinds = ATTACK_KINDS.filter((kind) => kind !== 'none');
		lines.push(`| Subject | ${kinds.join(' | ')} |`, `|---|${kinds.map(() => '---').join('|')}|`);
		for (const subject of measured)
			lines.push(
				`| \`${subject.id}\` | ${kinds.map((kind) => `${subject.byAttack[kind]?.flagged ?? 0}/${subject.byAttack[kind]?.rows ?? 0}`).join(' | ')} |`
			);
	}
	return lines.join('\n') + '\n';
}
