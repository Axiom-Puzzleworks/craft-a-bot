import { z } from 'zod';
import {
	stampComponent,
	type Guardrail,
	type GuardrailComponent,
	type Reader,
	type TypedAnswer,
	type TypedQuestion
} from '@craftabot/core';
import { DEFAULT_TAINT_WORDS, stringLeaves, taintReaching } from '../taint.js';

/**
 * **The bespoke four** (WP124, `106-BENCHMARK.md` §8): the components that
 * answer indirect injection — untrusted-content marking at `post-act`, taint
 * at `pre-act`, the quarantined reader (a factory over a reader and its
 * questions), and the red-team seat, which compiles no guardrail because it
 * is a source of attacks, not a screen.
 */
const FREE = { class: 'free', latency: 'none' } as const;

/** The untrusted-content marking component’s id (WP124). */
export const UNTRUSTED_CONTENT_COMPONENT_ID = 'governance/untrusted-content';
/** The taint component’s id (WP124). */
export const TAINT_COMPONENT_ID = 'governance/taint';
/** The red-team seat component’s id (WP124). */
export const RED_TEAM_SEAT_COMPONENT_ID = 'governance/red-team-seat';

/** Whether a call's result is one the config marks: every call, or those whose name begins with a listed prefix. */
function marksCall(sources: 'all' | readonly string[], name: string): boolean {
	return sources === 'all' || sources.some((prefix) => name.startsWith(prefix));
}

export const untrustedContentSchema = z.object({
	/** `all`, or the call-name prefixes whose results are untrusted: `fs-bank/connector_bureau`. */
	sources: z.union([z.literal('all'), z.array(z.string().min(1)).min(1)]).default('all')
});

/** Untrusted-content marking at `post-act`: what came back is marked and wrapped in the prompt (WP124, §8.1). */
export const untrustedContentComponent: GuardrailComponent<z.input<typeof untrustedContentSchema>> =
	{
		id: UNTRUSTED_CONTENT_COMPONENT_ID,
		name: 'Untrusted-content marking',
		description:
			'Marks what a tool or service line answered as untrusted: the prompt wraps it between markers as data, never instructions, and taint follows it.',
		technique: 'untrusted-content-marking',
		points: ['post-act'],
		verdicts: ['allow', 'annotate'],
		cost: FREE,
		configSchema: untrustedContentSchema,
		explain: (config) => {
			const parsed = untrustedContentSchema.parse(config);
			return parsed.sources === 'all'
				? 'Marks every call’s result untrusted.'
				: `Marks the results of ${parsed.sources.join(', ')} untrusted.`;
		},
		compile: (config, _deps, point) => {
			const { sources } = untrustedContentSchema.parse(config);
			const guardrail: Guardrail = {
				id: UNTRUSTED_CONTENT_COMPONENT_ID,
				name: 'Untrusted-content marking',
				description: 'Marks what came back as untrusted.',
				hooks: ['post-act'],
				check: (ctx) => {
					if (!ctx.result || !marksCall(sources, ctx.result.name)) return { allow: true };
					const source = `tool:${ctx.result.name}`;
					return {
						allow: true,
						verdictKind: 'annotate',
						finding: { category: 'untrusted-content', label: source },
						mark: { provenance: 'untrusted', source }
					};
				}
			};
			return stampComponent([guardrail], UNTRUSTED_CONTENT_COMPONENT_ID, point);
		}
	};

export const taintSchema = z.object({
	/** A tainted call is blocked, or waits for a person. */
	verdict: z.enum(['block-action', 'pause']).default('block-action'),
	/** The run of consecutive words an argument must share with untrusted text. */
	minWords: z.number().int().min(2).max(20).default(DEFAULT_TAINT_WORDS),
	/** One argument by dot path; absent, every string argument. */
	path: z.string().min(1).optional()
});

/** Taint at `pre-act`: refuses a call whose argument carries marked text (WP124, `106-BENCHMARK.md` §8.2). */
export const taintComponent: GuardrailComponent<z.input<typeof taintSchema>> = {
	id: TAINT_COMPONENT_ID,
	name: 'Taint',
	description:
		'Refuses a call whose argument carries text marked untrusted — the words of a poisoned file, copied into an action or a note.',
	technique: 'information-flow-control',
	points: ['pre-act'],
	verdicts: ['allow', 'block-action', 'pause'],
	cost: FREE,
	configSchema: taintSchema,
	explain: (config) => {
		const parsed = taintSchema.parse(config);
		return `${parsed.verdict === 'pause' ? 'Sends to a person' : 'Blocks'} a call whose ${parsed.path ?? 'arguments'} share ${parsed.minWords} words with untrusted text.`;
	},
	compile: (config, _deps, point) => {
		const parsed = taintSchema.parse(config);
		const guardrail: Guardrail = {
			id: TAINT_COMPONENT_ID,
			name: 'Taint',
			description: 'Refuses a call its untrusted input reaches.',
			hooks: ['pre-act'],
			check: (ctx) => {
				if (!ctx.proposed || !ctx.untrusted || ctx.untrusted.length === 0) return { allow: true };
				const value =
					parsed.path !== undefined
						? parsed.path
								.split('.')
								.reduce<unknown>(
									(at, key) =>
										at !== null && typeof at === 'object'
											? (at as Record<string, unknown>)[key]
											: undefined,
									ctx.proposed.arguments
								)
						: ctx.proposed.arguments;
				const reached = taintReaching(stringLeaves(value), ctx.untrusted, parsed.minWords);
				if (reached.length === 0) return { allow: true };
				const reason = `The call carries text marked untrusted (${reached.join(', ')}).`;
				return parsed.verdict === 'pause'
					? { pause: true, reason }
					: { allow: false, reason, disposition: 'block-action' };
			}
		};
		return stampComponent([guardrail], TAINT_COMPONENT_ID, point);
	}
};

/** The typed answers as words the acting seat reads in place of the content. */
export function describeAnswers(answers: Record<string, TypedAnswer>): string {
	return Object.entries(answers)
		.map(([id, answer]) => {
			switch (answer.type) {
				case 'noul':
					return `${id} — ${answer.noul >= 0.5 ? 'yes' : 'no'} (P ${answer.noul.toFixed(2)})`;
				case 'choice':
					return `${id} — ${answer.choice}${answer.confidence != null ? ` (confidence ${answer.confidence.toFixed(2)})` : ''}`;
				default:
					return `${id} — level ${answer.score}`;
			}
		})
		.join('; ');
}

/** What `quarantinedReaderComponent` takes: the reader alone allowed to read, and its questions (WP124, §8.3). */
export interface QuarantinedReaderOptions {
	/** Qualified: `fs-bank/guard/quarantined-reader`. */
	id: string;
	name: string;
	description: string;
	reader: Reader;
	questions: Record<string, TypedQuestion>;
}

export const quarantinedReaderSchema = z.object({
	sources: z.union([z.literal('all'), z.array(z.string().min(1)).min(1)]).default('all')
});

/**
 * **The quarantined reader** (§8.3): at `post-act` the reader alone reads
 * what came back, asked with an empty context — no line to call, no
 * provider, no tools, and `Reader` has no method but `ask` — and the mark's
 * replacement is its answers in words, so the acting seat's prompt never
 * holds the untrusted text.
 */
export function quarantinedReaderComponent(
	options: QuarantinedReaderOptions
): GuardrailComponent<z.input<typeof quarantinedReaderSchema>> {
	return {
		id: options.id,
		name: options.name,
		description: options.description,
		technique: 'privilege-separation',
		points: ['post-act'],
		verdicts: ['allow', 'annotate'],
		cost:
			options.reader.kind === 'rule'
				? FREE
				: options.reader.egress.length > 0
					? { class: 'metered', latency: 'network' }
					: { class: 'local-compute', latency: 'local' },
		configSchema: quarantinedReaderSchema,
		explain: () =>
			`${options.reader.name} alone reads each result and answers ${Object.keys(options.questions).join(', ')}; the acting seat reads the answers, never the result.`,
		compile: (config, _deps, point) => {
			const { sources } = quarantinedReaderSchema.parse(config);
			const guardrail: Guardrail = {
				id: options.id,
				name: options.name,
				description: options.description,
				hooks: ['post-act'],
				check: async (ctx) => {
					if (!ctx.result || !marksCall(sources, ctx.result.name)) return { allow: true };
					const source = `tool:${ctx.result.name}`;
					let replacement: string;
					try {
						// The quarantine: an empty context — nothing to call, nothing to act with.
						const response = await options.reader.ask(
							{ surface: 'tool-result', text: ctx.result.text },
							options.questions,
							{}
						);
						replacement = `A quarantined reader read this result and answered: ${describeAnswers(response.answers)}. The result itself is withheld.`;
					} catch {
						replacement = 'A quarantined reader could not read this result. It is withheld.';
					}
					return {
						allow: true,
						verdictKind: 'annotate',
						finding: { category: 'untrusted-content', label: source },
						mark: { provenance: 'untrusted', source, replacement }
					};
				}
			};
			return stampComponent([guardrail], options.id, point);
		}
	};
}

export const redTeamSeatSchema = z.object({ corpusId: z.string().min(1).optional() });

/**
 * **The red-team seat** (§8.4): seated by `campaign.counterpart.tier:
 * 'adversarial'`. It attacks; it does not screen. Fitted at the chokepoint it
 * only annotates the seat's lines, so the catalogue and the benchmark can
 * name it and a trace says it was there.
 */
export const redTeamSeatComponent: GuardrailComponent<z.input<typeof redTeamSeatSchema>> = {
	id: RED_TEAM_SEAT_COMPONENT_ID,
	name: 'Red-team seat',
	description:
		'A counterpart whose every line is an attack row of an adversarial corpus, seated by a campaign’s adversarial tier.',
	technique: 'automated-red-teaming',
	points: ['group'],
	verdicts: ['annotate'],
	cost: FREE,
	configSchema: redTeamSeatSchema,
	explain: (config) =>
		`Seats a counterpart speaking only attack rows of ${redTeamSeatSchema.parse(config).corpusId ?? 'the desk’s adversarial corpus'}; screens nothing.`,
	// At the chokepoint it screens nothing: it annotates, each turn the seat has spoken, how many of its lines the trace holds.
	compile: (_config, _deps, point) => {
		const guardrail: Guardrail = {
			id: RED_TEAM_SEAT_COMPONENT_ID,
			name: 'Red-team seat',
			description: 'Notes the red-team seat’s lines at the chokepoint.',
			hooks: ['pre-think'],
			check: (ctx) => {
				const lines = ctx.history.filter((event) =>
					JSON.stringify(event.payload).includes('"red-team"')
				).length;
				return lines === 0
					? { allow: true }
					: {
							allow: true,
							verdictKind: 'annotate',
							finding: { category: 'red-team', label: `${lines} red-team line(s) so far` }
						};
			}
		};
		return stampComponent([guardrail], RED_TEAM_SEAT_COMPONENT_ID, point);
	}
};

/** The three generic components the starter pack registers beside the built-ins. */
export const injectionComponents = [
	untrustedContentComponent,
	taintComponent,
	redTeamSeatComponent
] as const;
