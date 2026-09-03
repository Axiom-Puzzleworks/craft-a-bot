import type {
	GuardrailContext,
	GuardrailHook,
	GuardrailService,
	GuardrailServiceClient,
	ScreenRequest,
	ScreenResult
} from '@craftabot/core';
import type { HostedScreenConfig, HostedStrings, TextSelector } from '@craftabot/governance';
import { z } from 'zod';
import { createModelArmorClient, createOfflineArmorClient, describeEndpoint } from './client.js';
import type { ArmorClient, ArmorClientResult } from './client.js';
import type { ArmorConfig } from './config.js';
import { toScreenReading } from './reading.js';
import type { ArmorFilterKey } from './reading.js';
import {
	ALL_CLEAR_NOTE,
	GUARD_DID_NOT_FINISH,
	NOTHING_TO_CHECK,
	composeMatchReason,
	transportReason
} from './strings.js';
import { decisionText, observationText, resultText } from './text.js';
import { validateArmourCredential } from './validate.js';

/**
 * **Model Armor as a `GuardrailService`** (`29-GUARD-SHELL.md` §4.5, WP39
 * stage D). What this pack ships now: a client, a reading, some strings,
 * some fixtures — and this, the one object that ties them to the contract.
 * The disposition ladder, the clamp, fail-closed, the timeout and the trace
 * record are the shell's (`@craftabot/governance`'s `createHostedGuardrails`);
 * `geap/armor` (the brick) composes the two, and the generic Guard brick can
 * fit this service with no brick of its own.
 */

/** The vault id this service's battery lives under (`25-…` §4.6) — the brick declares the same. */
export const ARMOR_CREDENTIAL_ID = 'geap';

/** The service block of a fitted config: what the client needs, and nothing the shell dials on. */
export const armorServiceConfigSchema = z.object({
	projectId: z.string().min(1),
	location: z.string().min(1),
	templateId: z.string().min(1),
	injectionMinConfidence: z
		.enum(['LOW_AND_ABOVE', 'MEDIUM_AND_ABOVE', 'HIGH'])
		.default('MEDIUM_AND_ABOVE')
});
export type ArmorServiceConfig = z.infer<typeof armorServiceConfigSchema>;

function methodFor(hook: GuardrailHook): 'sanitizeUserPrompt' | 'sanitizeModelResponse' {
	return hook === 'pre-think' ? 'sanitizeUserPrompt' : 'sanitizeModelResponse';
}

/** A `GuardrailServiceClient` over an `ArmorClient` — the wire client stays what it was; this chooses the call and shapes the answer. */
export function armorServiceClient(
	client: ArmorClient,
	config: Pick<ArmorServiceConfig, 'projectId' | 'location' | 'templateId'>
): GuardrailServiceClient {
	return {
		async screen(request: ScreenRequest): Promise<ScreenResult> {
			// A screen that carries context is a model-response screen with the
			// observation as `userPrompt`, whatever the hook (`25-…` §4.5).
			const method =
				request.context !== undefined ? 'sanitizeModelResponse' : methodFor(request.hook);
			const result =
				method === 'sanitizeUserPrompt'
					? await client.sanitizeUserPrompt(request.text)
					: await client.sanitizeModelResponse(request.text, request.context);
			return toScreenResult(result, {
				service: 'model-armor',
				endpoint: describeEndpoint(config, method),
				template: config.templateId
			});
		}
	};
}

export function toScreenResult(
	result: ArmorClientResult,
	record: ScreenResult['record']
): ScreenResult {
	return 'error' in result
		? { error: result.error, record }
		: { reading: toScreenReading(result.reading), record };
}

export const modelArmorService: GuardrailService = {
	id: 'geap/model-armor',
	name: 'Model Armor',
	description:
		'Google Cloud Model Armor: screens text for prompt injection, harmful content, sensitive data and malicious links.',
	hooks: ['pre-think', 'pre-act', 'post-act'],
	credential: {
		id: ARMOR_CREDENTIAL_ID,
		name: 'Cloud Armour',
		kind: 'oauth-token',
		validate: (secret, fetchImpl, config) => validateArmourCredential(secret, fetchImpl, config)
	},
	egress: [
		{
			host: 'modelarmor.*.rep.googleapis.com',
			purpose: 'content screening',
			sends: ['observation', 'decision', 'result', 'credential-header']
		}
	],
	/** `csam` is never dialable (`25-…` §4.3). */
	alwaysStop: ['csam'],
	/** Confirmed by WP35's live checkpoint (`25-…` §11 stage B): the regional endpoint answers a browser's preflight. */
	browserCapable: true,
	configSchema: armorServiceConfigSchema,
	create: ({ config, fetch, getCredential, timeoutMs }) => {
		const parsed = armorServiceConfigSchema.parse(config);
		return armorServiceClient(
			createModelArmorClient({
				projectId: parsed.projectId,
				location: parsed.location,
				templateId: parsed.templateId,
				timeoutMs,
				fetch,
				token: () => getCredential(ARMOR_CREDENTIAL_ID)
			}),
			parsed
		);
	},
	createOffline: (config) =>
		armorServiceClient(createOfflineArmorClient(), armorServiceConfigSchema.parse(config))
};

/**
 * The Armour Brick's own lines through the shell's `HostedStrings` — its
 * users keep the reasons they know (`strings.ts`, `25-…` §4.4).
 */
export const armorStrings: HostedStrings = {
	nothingToCheck: NOTHING_TO_CHECK,
	allClear: ALL_CLEAR_NOTE,
	didNotFinish: GUARD_DID_NOT_FINISH,
	transport: transportReason,
	match: (matches) =>
		composeMatchReason(
			matches.map((match) => ({
				key: match.vendorLabel as ArmorFilterKey,
				...(match.vendorConfidence !== undefined
					? { confidence: match.vendorConfidence as 'LOW_AND_ABOVE' | 'MEDIUM_AND_ABOVE' | 'HIGH' }
					: {})
			}))
		)
};

const MIN_CONFIDENCE: Record<
	ArmorServiceConfig['injectionMinConfidence'],
	'low' | 'medium' | 'high'
> = { LOW_AND_ABOVE: 'low', MEDIUM_AND_ABOVE: 'medium', HIGH: 'high' };

/** The shell's dials, read off the brick's own config — the brick's schema does not change (`29-…` §4.5). */
export function screeningFor(config: ArmorConfig): HostedScreenConfig {
	return {
		screenObservation: config.screenObservation,
		screenDecision: config.screenDecision,
		screenResult: config.screenResult,
		perCategory: {
			injection: config.filters.injection,
			harmful: config.filters.harmfulContent,
			'sensitive-data': config.filters.sensitiveData,
			'malicious-link': config.filters.maliciousLinks
		},
		minConfidence: MIN_CONFIDENCE[config.injectionMinConfidence],
		onFailure: config.onFailure,
		timeoutMs: config.timeoutMs,
		offline: config.offline
	};
}

export function serviceConfigFor(config: ArmorConfig): ArmorServiceConfig {
	return {
		projectId: config.projectId,
		location: config.location,
		templateId: config.templateId,
		injectionMinConfidence: config.injectionMinConfidence
	};
}

/**
 * The brick's own selectors (`text.ts`) in the shell's shape — the
 * history-walking form the golden trace proves, kept over the shell's
 * defaults on purpose (`29-…` §4.2, §7).
 */
export const armorSelectors: Record<GuardrailHook, TextSelector> = {
	'pre-think': (ctx: GuardrailContext) => {
		const text = observationText(ctx.history);
		return text === undefined ? undefined : { text };
	},
	'pre-act': (ctx: GuardrailContext) => {
		const screen = decisionText(ctx.history, ctx.proposed);
		if (screen === undefined) return undefined;
		return screen.userPrompt !== undefined
			? { text: screen.text, context: screen.userPrompt }
			: { text: screen.text };
	},
	'post-act': (ctx: GuardrailContext) => {
		const text = resultText(ctx.history);
		return text === undefined ? undefined : { text };
	}
};
