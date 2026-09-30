import { z } from 'zod';
import {
	stampComponent,
	type Guardrail,
	type GuardrailComponent,
	type GuardrailContext,
	type PointKind,
	type Reader,
	type TypedQuestion
} from '@craftabot/core';

/**
 * **A reader as a guard** (WP120, `104-READERS.md` §10.3; `100-…` §6.3): one
 * noul — *is this a steer?*, *is this an injection?* — asked of a reader at a
 * point, over what the point has in hand: the prompt at `pre-think`, the
 * proposed call at `pre-act`, what came back at `post-act`, the stage's value
 * at a boundary. At or above the threshold the verdict is the config's
 * (`block-action`, or `annotate` to record and let it through); below it,
 * `allow`. A factory, because the reader and its question are content a pack
 * pairs — how the benchmark (WP122) sets a reader beside a service.
 */
export const readerComponentConfigSchema = z.object({
	threshold: z.number().min(0).max(1).default(0.5),
	verdict: z.enum(['block-action', 'annotate']).default('block-action')
});
export type ReaderComponentConfig = z.infer<typeof readerComponentConfigSchema>;

export interface ReaderComponentOptions {
	/** Qualified: `typesafe/guard/steer`. */
	id: string;
	name: string;
	description: string;
	reader: Reader;
	/** The one noul, by the id the reader answers it under. */
	questionId: string;
	question: Extract<TypedQuestion, { type: 'noul' }>;
	points?: PointKind[];
	/** The catalogue entry it implements; an input classifier by default. */
	technique?: string;
}

/** What the point has in hand, as the subject the reader is shown. */
export function subjectAt(ctx: GuardrailContext): unknown {
	if (ctx.stage) return ctx.stage.output ?? ctx.stage.input;
	if (ctx.hook === 'pre-think') return ctx.messages?.at(-1)?.content ?? ctx.observation?.text;
	if (ctx.hook === 'pre-act') return ctx.proposed;
	return ctx.response?.text ?? ctx.proposed;
}

export function readerComponent(
	options: ReaderComponentOptions
): GuardrailComponent<z.input<typeof readerComponentConfigSchema>> {
	const points = options.points ?? ['pre-think', 'pre-act', 'post-act', 'stage-in', 'stage-out'];
	const hooked = (kind: PointKind) =>
		kind === 'pre-think' || kind === 'pre-act' || kind === 'post-act' ? [kind] : [];
	return {
		id: options.id,
		name: options.name,
		description: options.description,
		technique: options.technique ?? 'input-classifier',
		points,
		verdicts: ['allow', 'block-action', 'annotate'],
		cost:
			options.reader.kind === 'rule'
				? { class: 'free', latency: 'none' }
				: options.reader.egress.length > 0
					? { class: 'metered', latency: 'network' }
					: { class: 'local-compute', latency: 'local' },
		...(options.reader.kind === 'hosted' || options.reader.kind === 'llm'
			? {
					connection: {
						kind: options.reader.kind === 'hosted' ? ('hosted' as const) : ('local' as const),
						wraps: options.reader.id,
						...(options.reader.credential ? { credential: options.reader.credential.id } : {}),
						egress: options.reader.egress,
						browserCapable: options.reader.browserCapable,
						standIn: options.reader.createOffline ? ('offline-fixture' as const) : ('none' as const)
					}
				}
			: {}),
		configSchema: readerComponentConfigSchema,
		explain: (config) => {
			const parsed = readerComponentConfigSchema.parse(config);
			return `Asks ${options.reader.name} "${options.questionId}" and, at P ≥ ${parsed.threshold.toFixed(2)}, ${parsed.verdict === 'annotate' ? 'records it' : 'blocks the action'}.`;
		},
		compile: (config, deps, point) => {
			const parsed = readerComponentConfigSchema.parse(config);
			const guardrail: Guardrail = {
				id: `${options.id}@${point.kind}`,
				name: options.name,
				description: options.description,
				hooks: hooked(point.kind),
				async check(ctx) {
					const response = await options.reader.ask(
						subjectAt(ctx),
						{ [options.questionId]: options.question },
						{ ...(deps.fetch ? { fetch: deps.fetch } : {}) }
					);
					const answer = response.answers[options.questionId];
					const p = answer?.type === 'noul' ? answer.noul : 0;
					if (p < parsed.threshold) return { allow: true };
					const reason = `${options.reader.name} reads "${options.questionId}" at ${p.toFixed(2)}`;
					return parsed.verdict === 'annotate'
						? {
								allow: true,
								verdictKind: 'annotate',
								note: reason,
								finding: { category: options.questionId, label: 'yes' }
							}
						: { allow: false, reason, disposition: 'block-action' };
				}
			};
			return stampComponent([guardrail], options.id, point);
		}
	};
}
