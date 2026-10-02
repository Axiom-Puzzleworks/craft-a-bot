import { z } from 'zod';
import {
	sha256Hex,
	stampComponent,
	type Guardrail,
	type GuardrailComponent
} from '@craftabot/core';
import { stringLeaves } from '../taint.js';

/**
 * **Prompt integrity and a secret scan** (WP149, `110-CONTROL-SUITE-PLAN.md`
 * §10): the instructions a bot runs under are the ones that were validated,
 * and nothing it is about to send carries a credential's shape.
 */
const FREE = { class: 'free', latency: 'none' } as const;

/** The prompt-integrity component's id (WP149). */
export const PROMPT_INTEGRITY_COMPONENT_ID = 'governance/prompt-integrity';
/** The secret-scan component's id (WP149). */
export const SECRET_SCAN_COMPONENT_ID = 'governance/secret-scan';

/** The prompt-integrity component's config: the system message's validated digest, and what to do on a mismatch. */
export const promptIntegritySchema = z.object({
	/** SHA-256 of the validated system message (`systemPromptDigest`). */
	validated: z.string().regex(/^[0-9a-f]{64}$/),
	verdict: z.enum(['stop-run', 'annotate']).default('stop-run')
});

/** The digest the component compares: the composed prompt's system message, as the provider will read it. */
export function systemPromptDigest(
	messages: ReadonlyArray<{ role: string; content: string }>
): string | undefined {
	const system = messages.find((message) => message.role === 'system');
	return system ? sha256Hex(system.content) : undefined;
}

/** Refuses a turn whose system prompt is not the one validated (WP149). */
export const promptIntegrityComponent: GuardrailComponent<z.input<typeof promptIntegritySchema>> = {
	id: PROMPT_INTEGRITY_COMPONENT_ID,
	name: 'Prompt integrity',
	description:
		'Compares the system prompt a turn is composed with against the digest it was validated at, and stops the run (or notes it) when they differ.',
	technique: 'prompt-integrity',
	points: ['pre-think'],
	verdicts: ['allow', 'stop-run', 'annotate'],
	cost: FREE,
	configSchema: promptIntegritySchema,
	explain: (config) =>
		`${promptIntegritySchema.parse(config).verdict === 'stop-run' ? 'Stops the run' : 'Notes it'} when the system prompt is not the one validated (${config.validated.slice(0, 12)}…).`,
	compile: (config, _deps, point) => {
		const { validated, verdict } = promptIntegritySchema.parse(config);
		const guardrail: Guardrail = {
			id: PROMPT_INTEGRITY_COMPONENT_ID,
			name: 'Prompt integrity',
			description: 'The system prompt is the one validated.',
			hooks: ['pre-think'],
			check: (ctx) => {
				const digest = ctx.messages ? systemPromptDigest(ctx.messages) : undefined;
				if (digest === undefined || digest === validated) return { allow: true };
				const label = `system prompt ${digest.slice(0, 12)}…, validated ${validated.slice(0, 12)}…`;
				return verdict === 'annotate'
					? { allow: true, verdictKind: 'annotate', finding: { category: 'prompt-changed', label } }
					: {
							allow: false,
							reason: `The system prompt is not the one validated (${label}).`,
							disposition: 'stop-run'
						};
			}
		};
		return stampComponent([guardrail], PROMPT_INTEGRITY_COMPONENT_ID, point);
	}
};

/**
 * The shapes a credential has — a provider key, a cloud access key, a token,
 * a private key — and what each is called. Shapes, never values: nothing
 * here is a real secret, and the scan refuses a match whatever its source.
 */
export const SECRET_SHAPES: ReadonlyArray<{ name: string; pattern: RegExp }> = [
	{ name: 'an API key (sk-…)', pattern: /\bsk-[A-Za-z0-9_-]{20,}/ },
	{ name: 'an AWS access key', pattern: /\bAKIA[0-9A-Z]{16}\b/ },
	{ name: 'a GitHub token', pattern: /\bgh[pousr]_[A-Za-z0-9]{36,}/ },
	{ name: 'a Slack token', pattern: /\bxox[abprs]-[A-Za-z0-9-]{10,}/ },
	{ name: 'a private key', pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ }
];

/** The names of the secret shapes a value's strings carry. */
export function secretShapesIn(value: unknown): string[] {
	const found = new Set<string>();
	for (const text of stringLeaves(value))
		for (const shape of SECRET_SHAPES) if (shape.pattern.test(text)) found.add(shape.name);
	return [...found];
}

/** Refuses a call whose arguments carry a credential's shape (WP149). */
export const secretScanComponent: GuardrailComponent<Record<string, never>> = {
	id: SECRET_SCAN_COMPONENT_ID,
	name: 'Secret scan',
	description:
		'Refuses a call whose arguments — what the bot is about to say or send — carry the shape of a key, token or private key.',
	technique: 'secret-scan',
	points: ['pre-act'],
	verdicts: ['allow', 'block-action'],
	cost: FREE,
	configSchema: z.object({}).strict() as unknown as z.ZodType<Record<string, never>>,
	explain: () => 'Refuses a call that would say or send something shaped like a credential.',
	compile: (_config, _deps, point) => {
		const guardrail: Guardrail = {
			id: SECRET_SCAN_COMPONENT_ID,
			name: 'Secret scan',
			description: 'Nothing the bot sends is shaped like a credential.',
			hooks: ['pre-act'],
			check: (ctx) => {
				if (!ctx.proposed) return { allow: true };
				const shapes = secretShapesIn(ctx.proposed.arguments);
				if (shapes.length === 0) return { allow: true };
				return {
					allow: false,
					reason: `${ctx.proposed.name} would send ${shapes.join(' and ')}.`,
					disposition: 'block-action'
				};
			}
		};
		return stampComponent([guardrail], SECRET_SCAN_COMPONENT_ID, point);
	}
};

/** The two the starter pack registers beside the built-ins. */
export const integrityComponents = [promptIntegrityComponent, secretScanComponent] as const;
