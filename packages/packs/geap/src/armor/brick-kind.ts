import type {
	BrickConfigProblem,
	BrickKindDefinition,
	BrickValidationContext,
	ControlHints
} from '@craftabot/core';
import {
	createHostedGuardrails,
	createNoRepetitionGuardrail,
	createStepBudgetGuardrail
} from '@craftabot/governance';
import { armorConfigSchema } from './config.js';
import type { ArmorConfig, ArmorDisposition } from './config.js';
import { HOOK_DESCRIPTION, HOOK_NAME } from './guardrails.js';
import { validateArmourCredential } from './validate.js';
import {
	ARMOR_CREDENTIAL_ID,
	armorSelectors,
	armorStrings,
	modelArmorService,
	screeningFor,
	serviceConfigFor
} from './service.js';

/**
 * The Armour Brick (`25-…` §4.3, WP35 stage D): the fitted kind, composing
 * `pack-geap`'s own library (Stage A), the hosted-call trace record (Stage
 * B) and the credential/network seam (Stage C) into a real `safety`-socket
 * brick. No mechanism is new here — every hook below is `starter/safety`'s
 * own shape, and `createRuntime`'s guardrail list is `25-…` §4.5's own
 * `createRuntime` sketch verbatim, now with real `ctx.fetch`/`ctx.getCredential`
 * behind it instead of a Workshop panel building the client by hand
 * (`armour-studio.ts`, stage B — kept as the seam's own proof, unchanged).
 */

export { ARMOR_CREDENTIAL_ID } from './service.js';

/**
 * A freshly-snapped brick: `offline` on, `screenDecision` on (D1's own
 * default), placeholder project/template. `configSchema` requires both
 * non-empty (Stage A's own test: an empty `projectId`/`templateId` fails to
 * parse) — `defaults` is re-parsed against that same schema every time a
 * fitted brick's config loads (`brick-runtimes.ts`'s `buildRuntimes`), so an
 * empty string here would leave a freshly-dropped brick with no runtime at
 * all. `'your-project-id'` reads unmistakably as "replace me"; `'cab-armour'`
 * is the exact template name `25-…` §4.9's own setup script creates, so a
 * builder who followed it can fit the brick and have this default already
 * be true.
 */
export const armorConfigDefaults: ArmorConfig = {
	projectId: 'your-project-id',
	location: 'europe-west2',
	templateId: 'cab-armour',
	screenObservation: 'off',
	screenDecision: 'ask',
	screenResult: 'off',
	filters: {
		injection: 'inherit',
		harmfulContent: 'inherit',
		sensitiveData: 'inherit',
		maliciousLinks: 'inherit'
	},
	injectionMinConfidence: 'MEDIUM_AND_ABOVE',
	onFailure: 'stop-run',
	timeoutMs: 3000,
	maxTicks: 30,
	offline: true
};

/**
 * A best-effort illustrative list, not an authoritative catalogue — Model
 * Armor's own region list is not published anywhere this pack can check it
 * against (`25-…` §4.1's own "unpublished" note applies here too). An
 * unrecognised region only ever warns (`25-…` §4.3): the schema accepts any
 * string, and a region this list has not heard of may simply be a newer one.
 */
const KNOWN_REGIONS = [
	'europe-west2',
	'europe-west1',
	'europe-west4',
	'us-central1',
	'us-east1',
	'us-east4',
	'us-west1',
	'asia-southeast1',
	'asia-northeast1'
];

const SCREEN_DIAL_LABELS = {
	off: 'Off',
	note: 'Just make a note',
	block: 'Stop that one thing',
	ask: 'Ask me first',
	stop: 'Stop the whole run'
};

const HOOK_ONLY_LABELS = { off: 'Off', note: 'Just make a note', stop: 'Stop the whole run' };

function choiceOptions(labels: Record<string, string>) {
	return Object.entries(labels).map(([value, label]) => ({ value, label }));
}

export const armorControlHints: ControlHints = {
	projectId: { control: 'text', label: 'Google Cloud project' },
	location: { control: 'text', label: 'Region', hint: 'A Model Armor region, e.g. europe-west2.' },
	templateId: { control: 'text', label: 'Template' },
	screenObservation: {
		control: 'choice',
		label: 'Screen what it sees',
		options: choiceOptions(HOOK_ONLY_LABELS)
	},
	screenDecision: {
		control: 'choice',
		label: 'Screen what it decides',
		hint: 'The one hook that can pause for your say-so.',
		options: choiceOptions(SCREEN_DIAL_LABELS)
	},
	screenResult: {
		control: 'choice',
		label: 'Screen what it did',
		options: choiceOptions(HOOK_ONLY_LABELS)
	},
	/*
	 * `filters` has no entry here, and could not usefully have one: it is a
	 * nested `z.object`, and `schema-fields.ts`'s `describeFields` reads only
	 * `configSchema`'s own top-level shape — a hint keyed `'filters.injection'`
	 * would never be looked up, and the field itself falls back to `default:
	 * text` in `controlFor`'s switch. This is a real, known gap (`25-…` §8's
	 * own dated note), not an oversight: `starter/safety` sets the precedent
	 * for a kind whose panel a hint set cannot fully cover reaching for a
	 * hand-written override instead (`14-…` §2.1's documented limit) — the
	 * per-filter overrides want the same treatment, left for the panel work
	 * that follows this stage.
	 */
	injectionMinConfidence: {
		control: 'choice',
		label: 'How sure before an instruction counts as sneaky',
		options: [
			{ value: 'LOW_AND_ABOVE', label: 'Fairly sure' },
			{ value: 'MEDIUM_AND_ABOVE', label: 'Quite sure' },
			{ value: 'HIGH', label: 'Very sure' }
		]
	},
	onFailure: {
		control: 'choice',
		label: "If the guard can't be reached",
		options: [
			{ value: 'stop-run', label: 'Stop the run (safest)' },
			{ value: 'allow-with-note', label: 'Carry on and make a note' }
		]
	},
	timeoutMs: {
		control: 'dial',
		label: 'Patience',
		options: [
			{ value: 500, label: 'Quick' },
			{ value: 3000, label: 'Normal' },
			{ value: 10000, label: 'Patient' }
		]
	},
	// The Safety Brick's own dial (`starter/brick-kinds.ts`) — the local floor
	// is the same idea here, so it reads the same way.
	maxTicks: {
		control: 'dial',
		label: 'Turns before the local floor stops the run',
		options: [
			{ value: 10, label: 'Short' },
			{ value: 30, label: 'Normal' },
			{ value: 60, label: 'Long' }
		]
	},
	offline: {
		control: 'switch',
		label: 'Unplugged',
		hint: 'Every screen reads clean; no network call is made.'
	}
};

/** `off`/`note`/`stop` clamp cleanly at every hook; `block`/`ask` only mean what they say at `pre-act`. */
function isClampedAtHookOnlyScreens(disposition: ArmorDisposition): boolean {
	return disposition === 'block' || disposition === 'ask';
}

export function describeArmorFitted(config: ArmorConfig): string {
	if (config.offline) return 'an armour brick, unplugged';
	const observing = config.screenObservation !== 'off';
	const deciding = config.screenDecision !== 'off';
	const acting = config.screenResult !== 'off';
	if (!observing && !deciding && !acting) return 'an armour brick, fitted but checking nothing';
	if (deciding && !observing && !acting) return 'an armour brick sending your decisions to a guard';
	return 'an armour brick sending what you see, decide and get back to a guard';
}

function validateArmorConfig(
	config: ArmorConfig,
	ctx: BrickValidationContext
): BrickConfigProblem[] {
	const problems: BrickConfigProblem[] = [];

	if (!KNOWN_REGIONS.includes(config.location)) {
		problems.push({
			code: 'unrecognised-armour-region',
			severity: 'warning',
			message: `"${config.location}" isn't a region this build recognises — it may still be a valid Model Armor region.`,
			details: { location: config.location }
		});
	}

	const overrides: Array<[string, ArmorDisposition]> = [
		['filters.injection', config.filters.injection],
		['filters.harmfulContent', config.filters.harmfulContent],
		['filters.sensitiveData', config.filters.sensitiveData],
		['filters.maliciousLinks', config.filters.maliciousLinks]
	];
	for (const [field, disposition] of overrides) {
		if (
			isClampedAtHookOnlyScreens(disposition) &&
			(config.screenObservation !== 'off' || config.screenResult !== 'off')
		) {
			problems.push({
				code: 'clamped-armour-disposition',
				severity: 'warning',
				message: `"${field}" is set to ${disposition}, which only means what it says at "Screen what it decides" — at the other two screens it clamps to stop/note.`,
				details: { field, disposition }
			});
		}
	}

	if (
		config.screenObservation === 'off' &&
		config.screenDecision === 'off' &&
		config.screenResult === 'off' &&
		!config.offline
	) {
		problems.push({
			code: 'armour-checks-nothing',
			severity: 'warning',
			message: 'The Armour Brick is fitted but every screen is off — it checks nothing.'
		});
	}

	if (!config.offline && !ctx.hasCredential(ARMOR_CREDENTIAL_ID)) {
		problems.push({
			code: 'armour-not-plugged-in',
			severity: 'warning',
			message: 'The Armour Brick is fitted but not plugged in; every hosted check will fail closed.'
		});
	}

	return problems;
}

export const armorBrickKind: BrickKindDefinition<ArmorConfig> = {
	id: 'geap/armor',
	slot: 'safety',

	name: 'Armour Brick',
	description:
		'Sends what your robot sees, thinks and says to a guard in the cloud, who checks it for tricks, rude words and secrets before it goes any further. Costs a tiny bit of your Google account each time, and the guard can be slow.',
	realName: 'Hosted content guardrails (Model Armor, Gemini Enterprise Agent Platform)',
	realExplanation:
		'The engine-floor rules stay local. Each observation, decision and result can also be screened by Google Cloud Model Armor for prompt injection, harmful content, sensitive data and malicious links. Every hosted verdict maps onto the same allow / block / ask / stop dispositions as the Safety Brick, every call and its latency is in the trace, and the brick fails closed when the guard cannot be reached.',

	configSchema: armorConfigSchema,
	configVersion: 1,
	defaults: armorConfigDefaults,

	audience: 'workshop',
	credential: {
		id: ARMOR_CREDENTIAL_ID,
		name: 'Cloud Armour',
		kind: 'oauth-token',
		validate: validateArmourCredential
	},

	controlHints: armorControlHints,
	describeFitted: describeArmorFitted,
	validateConfig: validateArmorConfig,

	// The local floor first, then the shell (`29-GUARD-SHELL.md` §4.5): the
	// brick's config splits into the service block and the screening dials,
	// and `createHostedGuardrails` builds one guardrail per dial that is on.
	createRuntime: (config, ctx) => ({
		// Where the shell may call on this brick's behalf (WP41) — nothing when unplugged.
		egress: config.offline ? [] : modelArmorService.egress,
		contributeGuardrails: () => [
			createStepBudgetGuardrail(config.maxTicks),
			...(config.repeatLimit !== undefined
				? [createNoRepetitionGuardrail(config.repeatLimit)]
				: []),
			...createHostedGuardrails({
				idPrefix: 'geap/armor',
				names: {
					'pre-think': { name: HOOK_NAME['pre-think'], description: HOOK_DESCRIPTION['pre-think'] },
					'pre-act': { name: HOOK_NAME['pre-act'], description: HOOK_DESCRIPTION['pre-act'] },
					'post-act': { name: HOOK_NAME['post-act'], description: HOOK_DESCRIPTION['post-act'] }
				},
				service: modelArmorService,
				serviceConfig: serviceConfigFor(config),
				screening: screeningFor(config),
				ctx,
				envelope: (guardCtx) => ({ agentId: guardCtx.spec.id, tick: guardCtx.tick }),
				selectors: armorSelectors,
				strings: armorStrings
			})
		]
	})
};
