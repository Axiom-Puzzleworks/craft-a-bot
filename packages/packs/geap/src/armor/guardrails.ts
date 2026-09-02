import type {
	EngineEvent,
	Guardrail,
	GuardrailContext,
	GuardrailHook,
	GuardrailService,
	GuardrailVerdict
} from '@craftabot/core';
import {
	createHostedGuardrails,
	verdictForReading,
	type HostedScreenConfig
} from '@craftabot/governance';
import { describeEndpoint } from './client.js';
import type { ArmorClient, ArmorClientResult } from './client.js';
import type { ArmorConfig } from './config.js';
import {
	armorServiceClient,
	armorStrings,
	modelArmorService,
	screeningFor,
	serviceConfigFor,
	toScreenResult
} from './service.js';
import type { DecisionScreen } from './text.js';

/**
 * **What is left of this file after the shell** (`29-GUARD-SHELL.md` §4.5,
 * WP39 stage D): two adapters that keep this pack's own vocabulary — and its
 * 585-line verdict table — pointing at the mechanism that now lives in
 * `@craftabot/governance`. No disposition, clamp, timeout, scrub or
 * record-assembly code is here any more; `guardrails.test.ts` is the
 * regression net that says the move changed nothing.
 */

/** The pure mapping from a client result to a verdict, in the brick's own config shape — `verdictForReading` through `armorStrings`. */
export function verdictFor(
	result: ArmorClientResult,
	hook: GuardrailHook,
	config: ArmorConfig
): GuardrailVerdict {
	return verdictForReading(
		toScreenResult(result, {
			service: 'model-armor',
			endpoint: describeEndpoint(
				config,
				hook === 'pre-think' ? 'sanitizeUserPrompt' : 'sanitizeModelResponse'
			),
			template: config.templateId
		}),
		hook,
		screeningFor(config),
		modelArmorService.alwaysStop ?? [],
		armorStrings
	);
}

export type ArmorTextSelector = (
	history: ReadonlyArray<EngineEvent>,
	proposed: GuardrailContext['proposed']
) => string | DecisionScreen | undefined;

export const HOOK_NAME: Record<GuardrailHook, string> = {
	'pre-think': 'Armour Brick (observation)',
	'pre-act': 'Armour Brick (decision)',
	'post-act': 'Armour Brick (result)'
};

export const HOOK_DESCRIPTION: Record<GuardrailHook, string> = {
	'pre-think': 'Sends what the bot can currently see to Model Armor before it thinks.',
	'pre-act': 'Sends what the bot is about to do to Model Armor before it acts.',
	'post-act': 'Sends what just happened to Model Armor after it acts.'
};

/** A service whose every client is the one handed in — for a caller that already built its `ArmorClient`. */
function serviceOver(
	client: ArmorClient,
	config: ArmorConfig,
	hook: GuardrailHook
): GuardrailService {
	const wrapped = armorServiceClient(client, serviceConfigFor(config));
	return {
		...modelArmorService,
		hooks: [hook],
		create: () => wrapped,
		createOffline: () => wrapped
	};
}

/**
 * One guardrail at one hook over a client the caller built — the shape this
 * pack's tests have always driven. `geap/armor`'s own `createRuntime` goes
 * through `createHostedGuardrails` directly (`brick-kind.ts`).
 */
export function armorGuardrail(
	id: string,
	hook: GuardrailHook,
	selector: ArmorTextSelector,
	config: ArmorConfig,
	client: ArmorClient
): Guardrail {
	const [guardrail] = createHostedGuardrails({
		idPrefix: id.replace(/:[^:]*$/, ''),
		names: { [hook]: { name: HOOK_NAME[hook], description: HOOK_DESCRIPTION[hook] } },
		service: serviceOver(client, config, hook),
		serviceConfig: serviceConfigFor(config),
		// Built whether or not this hook's dial is on — the caller decided to
		// fit it, as this function always worked. A dial that is `off` reads
		// as `note` here so the shell builds the rail; `geap/armor` itself
		// never asks for an off hook (`brick-kind.ts`).
		screening: onDial(screeningFor(config), hook),
		ctx: {
			fetch: () => Promise.reject(new Error('the client was built by the caller')),
			getCredential: () => undefined
		},
		envelope: (ctx) => ({ agentId: ctx.spec.id, tick: ctx.tick }),
		selectors: {
			[hook]: (ctx: GuardrailContext) => {
				const screen = selector(ctx.history, ctx.proposed);
				if (screen === undefined) return undefined;
				if (typeof screen === 'string') return { text: screen };
				return screen.userPrompt !== undefined
					? { text: screen.text, context: screen.userPrompt }
					: { text: screen.text };
			}
		},
		strings: armorStrings
	});
	if (guardrail === undefined) throw new Error(`no guardrail was built for ${hook}`);
	return { ...guardrail, id };
}

function onDial(screening: HostedScreenConfig, hook: GuardrailHook): HostedScreenConfig {
	const key =
		hook === 'pre-think'
			? 'screenObservation'
			: hook === 'post-act'
				? 'screenResult'
				: 'screenDecision';
	return screening[key] === 'off' ? { ...screening, [key]: 'note' } : screening;
}
