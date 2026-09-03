import type {
	BrickConfigProblem,
	BrickKindDefinition,
	BrickValidationContext,
	ControlHints,
	GuardrailService
} from '@craftabot/core';
import {
	createHostedGuardrails,
	createNoRepetitionGuardrail,
	createStepBudgetGuardrail,
	hostedScreenConfigSchema
} from '@craftabot/governance';
import { z } from 'zod';

/**
 * **The Guard Brick** (`29-GUARD-SHELL.md` §4.6, WP39 stage E): the generic
 * hosted-guardrail brick. A vendor pack that ships a `GuardrailService` and
 * nothing else is fittable on the bench through this — pick the service,
 * give it its own settings, dial the screens. `geap/armor` stays as the
 * vendor's own named brick, with its own copy and defaults; this is the one
 * for everyone else.
 *
 * Workshop-only (`audience: 'workshop'`, `25-…` D2): it appears in the parts
 * tray only with the door open, and never in the Kit's leaflet.
 */

export const GUARD_BRICK_ID = 'workshop/guard';

export const guardConfigSchema = z.object({
	/** A registered `GuardrailService` id — `''` until one is chosen. */
	serviceId: z.string().default(''),
	/**
	 * The service's own block, as JSON text — parsed by the chosen service's
	 * `configSchema` at validation and at run time. Text rather than a nested
	 * object because the shape depends on which service is picked, which the
	 * schema panel cannot know (`29-…` §8 D-h).
	 */
	serviceConfig: z.string().default('{}'),
	screening: hostedScreenConfigSchema.prefault({}),
	/** The local floor (`starter/safety`'s own two dials) — never leaves the browser. */
	maxTicks: z.number().int().positive().default(30),
	repeatLimit: z.number().int().min(2).max(10).optional()
});
export type GuardConfig = z.infer<typeof guardConfigSchema>;
export type GuardConfigInput = z.input<typeof guardConfigSchema>;

export const guardConfigDefaults: GuardConfig = {
	serviceId: '',
	serviceConfig: '{}',
	screening: hostedScreenConfigSchema.parse({ offline: true }),
	maxTicks: 30
};

/** The service block parsed through the service's own schema: the config, or the reason it is not one. */
export function parseServiceConfig(
	service: GuardrailService,
	text: string
): { ok: true; config: unknown } | { ok: false; message: string } {
	let raw: unknown;
	try {
		raw = JSON.parse(text);
	} catch (error) {
		return { ok: false, message: error instanceof Error ? error.message : String(error) };
	}
	const parsed = service.configSchema.safeParse(raw);
	return parsed.success
		? { ok: true, config: parsed.data }
		: { ok: false, message: parsed.error.issues[0]?.message ?? 'does not fit the service' };
}

const SCREEN_DIAL_LABELS = {
	off: 'Off',
	note: 'Just make a note',
	block: 'Stop that one thing',
	ask: 'Ask me first',
	stop: 'Stop the whole run'
};
const HOOK_ONLY_LABELS = { off: 'Off', note: 'Just make a note', stop: 'Stop the whole run' };
const choiceOptions = (labels: Record<string, string>) =>
	Object.entries(labels).map(([value, label]) => ({ value, label }));

export const guardControlHints: ControlHints = {
	serviceId: { control: 'choice', source: 'guardrailServices', label: 'Guard' },
	serviceConfig: {
		control: 'text',
		label: 'Guard settings (JSON)',
		hint: "The guard's own settings — project, region, template, or whatever it asks for."
	},
	screening: { label: 'Screens' },
	'screening.screenObservation': {
		control: 'choice',
		label: 'Screen what it sees',
		options: choiceOptions(HOOK_ONLY_LABELS)
	},
	'screening.screenDecision': {
		control: 'choice',
		label: 'Screen what it decides',
		hint: 'The one hook that can pause for your say-so.',
		options: choiceOptions(SCREEN_DIAL_LABELS)
	},
	'screening.screenResult': {
		control: 'choice',
		label: 'Screen what it did',
		options: choiceOptions(HOOK_ONLY_LABELS)
	},
	'screening.minConfidence': { control: 'choice', label: 'How sure before a finding counts' },
	'screening.onFailure': {
		control: 'choice',
		label: "If the guard can't be reached",
		options: [
			{ value: 'stop-run', label: 'Stop the run (safest)' },
			{ value: 'allow-with-note', label: 'Carry on and make a note' }
		]
	},
	'screening.timeoutMs': {
		control: 'dial',
		label: 'Patience',
		options: [
			{ value: 500, label: 'Quick' },
			{ value: 3000, label: 'Normal' },
			{ value: 10000, label: 'Patient' }
		]
	},
	'screening.offline': {
		control: 'switch',
		label: 'Unplugged',
		hint: 'Every screen reads clean; no network call is made.'
	},
	maxTicks: {
		control: 'dial',
		label: 'Turns before the local floor stops the run',
		options: [
			{ value: 10, label: 'Short' },
			{ value: 30, label: 'Normal' },
			{ value: 60, label: 'Long' }
		]
	}
};

function validateGuardConfig(
	config: GuardConfig,
	ctx: BrickValidationContext
): BrickConfigProblem[] {
	const problems: BrickConfigProblem[] = [];
	if (config.serviceId === '') {
		problems.push({
			code: 'guard-no-service',
			severity: 'warning',
			message: 'The Guard Brick is fitted but no guard is chosen — only the local floor will run.'
		});
		return problems;
	}
	if (!ctx.hasGuardrailService(config.serviceId)) {
		problems.push({
			code: 'unknown-guard-service',
			severity: 'warning',
			message: `The Guard Brick names "${config.serviceId}", which no installed pack ships — only the local floor will run.`,
			details: { serviceId: config.serviceId }
		});
		return problems;
	}
	// The service's own schema is what judges its block; the validation
	// context cannot hand the service over, so the block is checked for being
	// JSON here and against the schema at build time (`createRuntime`).
	try {
		JSON.parse(config.serviceConfig);
	} catch {
		problems.push({
			code: 'guard-service-config-not-json',
			severity: 'warning',
			message: "The guard's settings are not valid JSON — the guard will not be built."
		});
	}
	return problems;
}

export function describeGuardFitted(config: GuardConfig): string {
	if (config.serviceId === '') return 'a guard brick with no guard chosen';
	if (config.screening.offline) return `a guard brick (${config.serviceId}), unplugged`;
	return `a guard brick sending what you see, decide and get back to ${config.serviceId}`;
}

export const guardBrickKind: BrickKindDefinition<GuardConfig> = {
	id: GUARD_BRICK_ID,
	slot: 'safety',

	name: 'Guard Brick',
	description:
		'Sends what your robot sees, thinks and says to a guard you choose, who checks it before it goes any further.',
	realName: 'Hosted guardrail service (vendor-neutral)',
	realExplanation:
		'Any registered guardrail service — a cloud content filter, a policy decision point — screens each observation, decision and result through the same shell the Armour Brick uses: the same allow / block / ask / stop dispositions, every call and its latency on the trace, fail-closed when the guard cannot be reached.',

	configSchema: guardConfigSchema,
	configVersion: 1,
	defaults: guardConfigDefaults,

	audience: 'workshop',
	controlHints: guardControlHints,
	describeFitted: describeGuardFitted,
	validateConfig: validateGuardConfig,

	createRuntime: (config, ctx) => {
		const floor = [
			createStepBudgetGuardrail(config.maxTicks),
			...(config.repeatLimit !== undefined ? [createNoRepetitionGuardrail(config.repeatLimit)] : [])
		];
		const service = ctx.getGuardrailService(config.serviceId);
		const parsed = service ? parseServiceConfig(service, config.serviceConfig) : undefined;
		if (!service || !parsed || !parsed.ok) return { contributeGuardrails: () => floor };
		return {
			// Where the shell may call on this brick's behalf (WP41) — nothing when unplugged.
			egress: config.screening.offline ? [] : service.egress,
			contributeGuardrails: () => [
				...floor,
				...createHostedGuardrails({
					idPrefix: GUARD_BRICK_ID,
					service,
					serviceConfig: parsed.config,
					screening: config.screening,
					ctx,
					envelope: (guardCtx) => ({ agentId: guardCtx.spec.id, tick: guardCtx.tick })
				})
			]
		};
	}
};
