import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { ChatRequest, LLMProvider } from '@craftabot/core';
import { itemEstimate, type Estimate } from '@craftabot/metrics';
import type { HarnessConfig } from '../config.js';
import type { CredentialSource } from '../credentials.js';
import { experimentRun } from './experiment.js';

/**
 * **The determinism probe** (WP192, `113-RECORDING-AND-RELIABILITY.md` §4.8):
 * the same prompts sent over and over, to see how much of a live model's
 * variance is the model's own and how much a journey makes of it. Three arms —
 * temperature 0 with no seed, temperature 0 with a seed, a warmer temperature
 * with a seed — each asked of each *configuration* (a serving unit alone, each
 * unit alone, the pair together) so that two questions get an answer the first
 * recording could not give: does the pair add variance beyond one unit, and
 * does a seed make an answer repeatable?
 *
 * Unit of analysis: the prompt. A prompt's repeats are one observation of how
 * that prompt goes, so every rate is a mean over prompts with an interval over
 * prompts.
 */
export interface ProbeArm {
	id: string;
	temperature: number;
	seed?: number;
}

/** The three arms of §4.8; the warm one's temperature is the caller's to say. */
export const probeArms = (warm = 0.7): ProbeArm[] => [
	{ id: 'temperature-0', temperature: 0 },
	{ id: 'temperature-0-seed', temperature: 0, seed: 1 },
	{ id: `temperature-${warm}-seed`, temperature: warm, seed: 1 }
];

export interface ProbeConfig {
	/** `spark-619c`, `spark-ef08`, `pair` — whatever the caller calls it. */
	id: string;
	provider: LLMProvider;
}

export interface ProbeAnswer {
	text: string;
	call: string;
	outputTokens: number;
}

export interface ProbeOptions {
	/** The requests to repeat; each keeps its own messages, tools, model and token cap, with the arm's temperature and seed. */
	requests: readonly ChatRequest[];
	configs: readonly ProbeConfig[];
	arms: readonly ProbeArm[];
	/** How many times each prompt is sent, per configuration and arm. */
	repeat: number;
	/** Requests in flight at once. */
	concurrency?: number;
	confidence?: number;
}

export interface ProbeRow {
	config: string;
	arm: string;
	/** Of every two answers to one prompt, how often the text was identical. */
	sameText: Estimate;
	/** …and the call (the tool and its arguments). */
	sameCall: Estimate;
	/** The character at which two different answers first differed, on average; null when none differed. */
	meanFirstDifferingChar: number | null;
	/** The spread (standard deviation) of the output length in tokens, averaged over prompts. */
	meanTokenSpread: number;
	/** Requests that failed, and so left no answer. */
	failed: number;
}

export interface ProbeCrossRow {
	a: string;
	b: string;
	arm: string;
	/** Of every answer from `a` against every answer from `b` to one prompt, how often the text was identical. */
	sameText: Estimate;
	sameCall: Estimate;
}

export interface ProbeReport {
	prompts: number;
	repeat: number;
	rows: ProbeRow[];
	cross: ProbeCrossRow[];
}

const callOf = (response: Awaited<ReturnType<LLMProvider['chat']>>): string =>
	response.toolCall
		? `${response.toolCall.name} ${JSON.stringify(response.toolCall.arguments ?? {})}`
		: 'none';

const firstDifference = (a: string, b: string): number => {
	const shared = Math.min(a.length, b.length);
	for (let i = 0; i < shared; i += 1) if (a[i] !== b[i]) return i;
	return shared;
};

/** Run `jobs` at most `limit` at a time, results in order. */
async function pooled<T>(jobs: ReadonlyArray<() => Promise<T>>, limit: number): Promise<T[]> {
	const results: T[] = new Array(jobs.length);
	let next = 0;
	const worker = async () => {
		while (next < jobs.length) {
			const mine = next++;
			results[mine] = await jobs[mine]!();
		}
	};
	await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, jobs.length)) }, worker));
	return results;
}

export async function probeDeterminism(options: ProbeOptions): Promise<ProbeReport> {
	const { requests, configs, arms, repeat } = options;
	if (repeat < 2)
		throw new Error('probe: --repeat wants at least 2: one answer says nothing about repeating');
	const signal = new AbortController().signal;
	// answers[config][arm][prompt] = the answers (failed ones left out) and the number that failed.
	type Cell = { answers: ProbeAnswer[]; failed: number };
	const cells = new Map<string, Cell>();
	const keyOf = (config: string, arm: string, prompt: number) => `${config}|${arm}|${prompt}`;
	const jobs: Array<() => Promise<void>> = [];
	for (const config of configs)
		for (const arm of arms)
			requests.forEach((request, prompt) => {
				const cell: Cell = { answers: [], failed: 0 };
				cells.set(keyOf(config.id, arm.id, prompt), cell);
				for (let r = 0; r < repeat; r += 1)
					jobs.push(async () => {
						try {
							const response = await config.provider.chat(
								{
									...request,
									temperature: arm.temperature,
									...(arm.seed !== undefined ? { seed: arm.seed } : {})
								},
								{ signal }
							);
							cell.answers.push({
								text: response.text,
								call: callOf(response),
								outputTokens: response.usage.outputTokens
							});
						} catch {
							cell.failed += 1;
						}
					});
			});
	await pooled(jobs, options.concurrency ?? 4);

	const rate = (values: number[]) =>
		itemEstimate(
			values,
			options.confidence !== undefined ? { confidence: options.confidence } : {}
		);
	const rows: ProbeRow[] = [];
	for (const config of configs)
		for (const arm of arms) {
			const sameText: number[] = [];
			const sameCall: number[] = [];
			const spreads: number[] = [];
			const diffs: number[] = [];
			let failed = 0;
			requests.forEach((_request, prompt) => {
				const cell = cells.get(keyOf(config.id, arm.id, prompt))!;
				failed += cell.failed;
				const a = cell.answers;
				if (a.length < 2) return;
				let pairs = 0;
				let text = 0;
				let call = 0;
				for (let i = 0; i < a.length; i += 1)
					for (let j = i + 1; j < a.length; j += 1) {
						pairs += 1;
						if (a[i]!.text === a[j]!.text) text += 1;
						else diffs.push(firstDifference(a[i]!.text, a[j]!.text));
						if (a[i]!.call === a[j]!.call) call += 1;
					}
				sameText.push(text / pairs);
				sameCall.push(call / pairs);
				const mean = a.reduce((s, x) => s + x.outputTokens, 0) / a.length;
				spreads.push(
					Math.sqrt(a.reduce((s, x) => s + (x.outputTokens - mean) ** 2, 0) / (a.length - 1))
				);
			});
			rows.push({
				config: config.id,
				arm: arm.id,
				sameText: rate(sameText),
				sameCall: rate(sameCall),
				meanFirstDifferingChar:
					diffs.length === 0 ? null : diffs.reduce((s, d) => s + d, 0) / diffs.length,
				meanTokenSpread:
					spreads.length === 0 ? 0 : spreads.reduce((s, d) => s + d, 0) / spreads.length,
				failed
			});
		}

	const cross: ProbeCrossRow[] = [];
	for (let x = 0; x < configs.length; x += 1)
		for (let y = x + 1; y < configs.length; y += 1)
			for (const arm of arms) {
				const sameText: number[] = [];
				const sameCall: number[] = [];
				requests.forEach((_request, prompt) => {
					const a = cells.get(keyOf(configs[x]!.id, arm.id, prompt))!.answers;
					const b = cells.get(keyOf(configs[y]!.id, arm.id, prompt))!.answers;
					if (a.length === 0 || b.length === 0) return;
					let text = 0;
					let call = 0;
					for (const p of a)
						for (const q of b) {
							if (p.text === q.text) text += 1;
							if (p.call === q.call) call += 1;
						}
					sameText.push(text / (a.length * b.length));
					sameCall.push(call / (a.length * b.length));
				});
				cross.push({
					a: configs[x]!.id,
					b: configs[y]!.id,
					arm: arm.id,
					sameText: rate(sameText),
					sameCall: rate(sameCall)
				});
			}
	return { prompts: requests.length, repeat, rows, cross };
}

export function renderProbe(report: ProbeReport): string {
	const pc = (value: number) => `${(value * 100).toFixed(0)}%`;
	const est = (e: Estimate) => `${pc(e.value)} (${pc(e.interval[0])}–${pc(e.interval[1])})`;
	const lines = [
		`determinism probe: ${report.prompts} prompts, each sent ${report.repeat} times per configuration and arm`,
		'',
		'| Configuration | Arm | Same text | Same call | First differs at char | Token spread | Failed |',
		'|---|---|---|---|---|---|---|'
	];
	for (const row of report.rows)
		lines.push(
			`| ${row.config} | ${row.arm} | ${est(row.sameText)} | ${est(row.sameCall)} | ${row.meanFirstDifferingChar === null ? '—' : row.meanFirstDifferingChar.toFixed(0)} | ${row.meanTokenSpread.toFixed(1)} | ${row.failed} |`
		);
	if (report.cross.length > 0) {
		lines.push('', '| Between | Arm | Same text | Same call |', '|---|---|---|---|');
		for (const row of report.cross)
			lines.push(
				`| ${row.a} and ${row.b} | ${row.arm} | ${est(row.sameText)} | ${est(row.sameCall)} |`
			);
	}
	return `${lines.join('\n')}\n`;
}

// ── probe prompts: real requests from a recording ───────────────────────────────────────────────

export interface ProbePromptsOptions {
	/** The cell-scoped recording and the design it was made from. */
	recording: string;
	file: string;
	/** How many prompts to take, evenly across the cells. */
	count: number;
	out: string;
	/** Where the prompts file is written. */
	promptsFile: string;
	config: HarnessConfig;
	credentials: CredentialSource;
	size?: number;
	trials?: number;
}

/**
 * **Real first-tick prompts from a recording** (WP192): a recording keeps the
 * digest of every prompt, not its text, so the design is replayed from it, no
 * network, and each cell's first request is taken as it is asked. Written as a
 * JSON file of requests the probe repeats.
 */
export async function probePrompts(options: ProbePromptsOptions): Promise<{ prompts: number }> {
	await readFile(options.recording, 'utf8');
	const firsts = new Map<string, ChatRequest>();
	await experimentRun({
		file: options.file,
		out: options.out,
		config: options.config,
		credentials: options.credentials,
		...(options.size !== undefined ? { size: options.size } : {}),
		...(options.trials !== undefined ? { trials: options.trials } : {}),
		egress: 'none',
		onReplayRequest: ({ cellKey, role, index, request }) => {
			if (role === 'agent' && index === 0 && !firsts.has(cellKey)) firsts.set(cellKey, request);
		}
	});
	const keys = [...firsts.keys()].sort();
	if (keys.length === 0) throw new Error('probe prompts: the recording asked no prompts');
	const count = Math.min(options.count, keys.length);
	const chosen = Array.from({ length: count }, (_, i) =>
		firsts.get(keys[Math.floor((i * keys.length) / count)]!)!
	);
	await mkdir(dirname(options.promptsFile), { recursive: true });
	await writeFile(
		options.promptsFile,
		`${JSON.stringify({ requests: chosen }, null, '\t')}\n`,
		'utf8'
	);
	return { prompts: chosen.length };
}

export async function readPrompts(file: string): Promise<ChatRequest[]> {
	const parsed = JSON.parse(await readFile(file, 'utf8')) as { requests?: ChatRequest[] };
	if (!Array.isArray(parsed.requests) || parsed.requests.length === 0)
		throw new Error(`${file} holds no requests; make one with \`craftabot probe prompts\``);
	return parsed.requests;
}

/** Where a probe's own outputs go beside a prompts file. */
export const probeOutputs = (out: string) => ({
	json: join(out, 'probe.json'),
	markdown: join(out, 'probe.md')
});
