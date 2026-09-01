import type {
	EngineEvent,
	Guardrail,
	GuardrailContext,
	GuardrailHook,
	GuardrailVerdict
} from '@craftabot/core';
import type { ArmorClient, ArmorClientResult } from './client.js';
import type { ArmorConfig } from './config.js';
import type { ArmorFilterKey } from './reading.js';
import {
	ALL_CLEAR_NOTE,
	GUARD_DID_NOT_FINISH,
	NOTHING_TO_CHECK,
	composeMatchReason,
	transportReason
} from './strings.js';
import type { MatchedFilter } from './strings.js';
import type { DecisionScreen } from './text.js';

/**
 * `verdictFor` — the pure mapping from a client result to a `GuardrailVerdict`
 * (`25-…` §4.4's table). No I/O, no `Guardrail` shape here; `guardrails.test.ts`
 * table-tests it directly over hook × dial × filter × confidence × outcome.
 */

type Disposition = 'off' | 'note' | 'block' | 'ask' | 'stop';

/** Ordered least to most severe — `screenDecision`'s own enum order (`config.ts`) is this ranking. */
const SEVERITY: readonly Disposition[] = ['off', 'note', 'block', 'ask', 'stop'];

const OVERRIDE_KEY_FOR: Record<Exclude<ArmorFilterKey, 'csam'>, keyof ArmorConfig['filters']> = {
	injection: 'injection',
	hate: 'harmfulContent',
	harassment: 'harmfulContent',
	dangerous: 'harmfulContent',
	sexual: 'harmfulContent',
	sensitiveData: 'sensitiveData',
	maliciousUri: 'maliciousLinks'
};

function hookDial(hook: GuardrailHook, config: ArmorConfig): Disposition {
	if (hook === 'pre-think') return config.screenObservation;
	if (hook === 'post-act') return config.screenResult;
	return config.screenDecision;
}

/** `pre-think`/`post-act` cannot pause or block one action — only note or stop the whole run (`25-…` §4.3). */
function clampForHook(disposition: Disposition, hook: GuardrailHook): Disposition {
	if (hook === 'pre-act') return disposition;
	return disposition === 'block' || disposition === 'ask' ? 'stop' : disposition;
}

/** `csam` is never dialable (`25-…` §4.3) — every other filter resolves its override, or falls back to the hook dial. */
function effectiveDisposition(
	filterKey: ArmorFilterKey,
	hook: GuardrailHook,
	config: ArmorConfig
): Disposition {
	if (filterKey === 'csam') return 'stop';
	const override = config.filters[OVERRIDE_KEY_FOR[filterKey]];
	const dial = override !== 'inherit' ? override : hookDial(hook, config);
	return clampForHook(dial, hook);
}

function verdictForUnreachable(reason: string, config: ArmorConfig): GuardrailVerdict {
	return config.onFailure === 'stop-run'
		? { allow: false, reason, disposition: 'stop-run' }
		: { allow: true, note: reason };
}

export function verdictFor(
	result: ArmorClientResult,
	hook: GuardrailHook,
	config: ArmorConfig
): GuardrailVerdict {
	if ('error' in result) return verdictForUnreachable(transportReason(result.error.kind), config);

	const { reading } = result;

	if (reading.filters.csam.matched) {
		return { allow: false, reason: composeMatchReason([{ key: 'csam' }]), disposition: 'stop-run' };
	}

	const filterKeys = Object.keys(reading.filters) as ArmorFilterKey[];
	const fired = filterKeys
		.filter((key) => key !== 'csam' && reading.filters[key].matched)
		.map((key) => ({
			key,
			confidence: reading.filters[key].confidence,
			disposition: effectiveDisposition(key, hook, config)
		}))
		.filter((entry) => entry.disposition !== 'off');

	if (fired.length === 0) {
		return reading.outcome === 'ok'
			? { allow: true, note: ALL_CLEAR_NOTE }
			: verdictForUnreachable(GUARD_DID_NOT_FINISH, config);
	}

	const strictest = fired.reduce<Disposition>(
		(worst, entry) =>
			SEVERITY.indexOf(entry.disposition) > SEVERITY.indexOf(worst) ? entry.disposition : worst,
		'off'
	);
	const matches: MatchedFilter[] = fired.map((entry) =>
		entry.confidence !== undefined
			? { key: entry.key, confidence: entry.confidence }
			: { key: entry.key }
	);
	const reason = composeMatchReason(matches);

	if (strictest === 'note') return { allow: true, note: reason };
	if (strictest === 'block') return { allow: false, reason, disposition: 'block-action' };
	if (strictest === 'ask') return { pause: true, reason };
	return { allow: false, reason, disposition: 'stop-run' };
}

/**
 * The single factory, called three times — one per hook (`25-…` §4.5's own
 * `createRuntime` sketch). `check()`-only in Stage A: `checkWithRecord` and
 * the `guardrail.external` record are added in Stage B, alongside the core
 * seam they depend on.
 */
export type ArmorTextSelector = (
	history: ReadonlyArray<EngineEvent>,
	proposed: GuardrailContext['proposed']
) => string | DecisionScreen | undefined;

const HOOK_NAME: Record<GuardrailHook, string> = {
	'pre-think': 'Armour Brick (observation)',
	'pre-act': 'Armour Brick (decision)',
	'post-act': 'Armour Brick (result)'
};

const HOOK_DESCRIPTION: Record<GuardrailHook, string> = {
	'pre-think': 'Sends what the bot can currently see to Model Armor before it thinks.',
	'pre-act': 'Sends what the bot is about to do to Model Armor before it acts.',
	'post-act': 'Sends what just happened to Model Armor after it acts.'
};

function isDecisionScreen(screen: string | DecisionScreen): screen is DecisionScreen {
	return typeof screen === 'object';
}

export function armorGuardrail(
	id: string,
	hook: GuardrailHook,
	selector: ArmorTextSelector,
	config: ArmorConfig,
	client: ArmorClient
): Guardrail {
	return {
		id,
		name: HOOK_NAME[hook],
		description: HOOK_DESCRIPTION[hook],
		hooks: [hook],
		check: async (ctx: GuardrailContext): Promise<GuardrailVerdict> => {
			const screen = selector(ctx.history, ctx.proposed);
			if (screen === undefined) return { allow: true, note: NOTHING_TO_CHECK };

			const result = isDecisionScreen(screen)
				? await client.sanitizeModelResponse(screen.text, screen.userPrompt)
				: hook === 'pre-think'
					? await client.sanitizeUserPrompt(screen)
					: await client.sanitizeModelResponse(screen);

			return verdictFor(result, hook, config);
		}
	};
}
