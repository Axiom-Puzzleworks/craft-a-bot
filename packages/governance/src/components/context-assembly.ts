import { z } from 'zod';
import {
	sha256Hex,
	stampComponent,
	type Guardrail,
	type GuardrailComponent
} from '@craftabot/core';

/**
 * **Context assembly** (plan 114 WP206, G183): what a bot is told is a control, and the largest one this project has measured. The first
 * live recordings scored the bot against thresholds its prompt never carried — the desk brief was never in it — and agreement went from
 * 53% to 100% on one desk the day the rule was put on the case file. This component checks, at `pre-think`, that the composed prompt
 * carries what the stage is scored against, and says what the prompt was: a digest of it, and which required words it lacked.
 *
 * Config: `mustContain` — regular expressions the composed prompt (every message but the system's own) must each match. A mismatch is
 * recorded as an `annotate` finding (default) or ends the run (`stop-run`). Either way, the allow carries the prompt's digest as the
 * finding's label, so the trace says which prompt the bot read.
 */
const FREE = { class: 'free', latency: 'none' } as const;

/** The context-assembly component's id (plan 114 WP206). */
export const CONTEXT_ASSEMBLY_COMPONENT_ID = 'governance/context-assembly';

/** The context-assembly component's config: the texts the prompt must carry and what a miss does. */
export const contextAssemblySchema = z.object({
	/** Regular-expression sources, each of which the composed prompt must match. */
	mustContain: z.array(z.string().min(1)).min(1),
	verdict: z.enum(['annotate', 'stop-run']).default('annotate')
});

/** The text a turn's prompt carries beyond the framework's own system message: what the desk and the case put in front of the bot. */
export function promptBody(messages: ReadonlyArray<{ role: string; content: string }>): string {
	return messages
		.filter((message) => message.role !== 'system')
		.map((message) => message.content)
		.join('\n');
}

/** Which of the required patterns the prompt does not match, and the digest of the body it was read from. */
export function contextCheck(
	messages: ReadonlyArray<{ role: string; content: string }>,
	mustContain: readonly string[]
): { digest: string; missing: string[] } {
	const body = promptBody(messages);
	return {
		digest: sha256Hex(body),
		missing: mustContain.filter((source) => !new RegExp(source, 'i').test(body))
	};
}

/** The component: a `pre-think` guard that notes (or stops on) a prompt missing what the stage is scored against, and digests every prompt. */
export const contextAssemblyComponent: GuardrailComponent<z.input<typeof contextAssemblySchema>> = {
	id: CONTEXT_ASSEMBLY_COMPONENT_ID,
	name: 'Context assembly',
	description:
		'Checks, before the bot thinks, that the composed prompt carries what the stage is scored against — the rule, the records — and records which prompt it was by digest.',
	technique: 'context-assembly',
	points: ['pre-think'],
	verdicts: ['allow', 'stop-run', 'annotate'],
	cost: FREE,
	configSchema: contextAssemblySchema,
	explain: (config) => {
		const { mustContain, verdict } = contextAssemblySchema.parse(config);
		return `${verdict === 'stop-run' ? 'Stops the run' : 'Notes it'} when the prompt lacks ${mustContain.length === 1 ? 'a required text' : `any of ${mustContain.length} required texts`}, and records the prompt's digest every turn.`;
	},
	compile: (config, _deps, point) => {
		const { mustContain, verdict } = contextAssemblySchema.parse(config);
		const guardrail: Guardrail = {
			id: CONTEXT_ASSEMBLY_COMPONENT_ID,
			name: 'Context assembly',
			description: 'The prompt carries what the stage is scored against.',
			hooks: ['pre-think'],
			check: (ctx) => {
				if (!ctx.messages) return { allow: true };
				const { digest, missing } = contextCheck(ctx.messages, mustContain);
				if (missing.length === 0)
					return {
						allow: true,
						verdictKind: 'annotate',
						finding: { category: 'context-complete', label: `prompt ${digest.slice(0, 12)}` }
					};
				const label = `prompt ${digest.slice(0, 12)} lacks ${missing.join(', ')}`;
				return verdict === 'stop-run'
					? {
							allow: false,
							reason: `The prompt does not carry what the stage is scored against: ${label}.`,
							disposition: 'stop-run'
						}
					: {
							allow: true,
							verdictKind: 'annotate',
							finding: { category: 'context-missing', label }
						};
			}
		};
		return stampComponent([guardrail], CONTEXT_ASSEMBLY_COMPONENT_ID, point);
	}
};

/** The component the starter pack registers beside the others (plan 114 WP206). */
export const contextAssemblyComponents = [contextAssemblyComponent] as const;
