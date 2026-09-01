import fixtureClean from '../fixtures/clean.json';
import {
	armorErrorFromNetworkFailure,
	armorErrorFromStatus,
	armorErrorFromTimeout,
	scrubToken
} from './errors.js';
import type { ArmorError } from './errors.js';
import { readSanitizationResult } from './reading.js';
import type { ArmorReading } from './reading.js';

/**
 * The Model Armor REST client (`25-…` §4.1/§4.5).
 *
 * **Only ever builds a regional URL.** `{LOCATION}` is baked into the host at
 * construction; there is no code path — no flag, no fallback — that can
 * build `https://modelarmor.rep.googleapis.com` (the global host, which
 * refuses sanitize calls). `client.test.ts` asserts this directly rather than
 * trusting the read of this file.
 *
 * **Never throws.** Every call resolves to `{reading} | {error}`; the guard's
 * own failure is data for `guardrails.ts`'s `onFailure` dial, not a JS
 * exception (`25-…` §4.4's transport/auth row). Every message text is passed
 * through `scrubToken()` before it can reach a caller, the trace, or a test
 * assertion.
 *
 * Stage A does not yet read a credential through the brick-runtime seam
 * (`25-…` §4.6, Stage C) — `token` is a plain thunk here, exactly as
 * `createRuntime`'s own sketch in §4.5 shows it being called
 * (`token: () => ctx.getCredential('geap')`), so Stage C only has to supply
 * the thunk, not change this file's shape.
 */

export interface ModelArmorClientOptions {
	projectId: string;
	location: string;
	templateId: string;
	timeoutMs: number;
	fetch: typeof globalThis.fetch;
	token: () => string | undefined;
}

export type ArmorClientResult = { reading: ArmorReading } | { error: ArmorError };

export interface ArmorClient {
	sanitizeUserPrompt(text: string): Promise<ArmorClientResult>;
	sanitizeModelResponse(text: string, userPrompt?: string): Promise<ArmorClientResult>;
}

function templateUrl(
	options: Pick<ModelArmorClientOptions, 'projectId' | 'location' | 'templateId'>
): string {
	const host = `https://modelarmor.${options.location}.rep.googleapis.com`;
	return `${host}/v1/projects/${encodeURIComponent(options.projectId)}/locations/${encodeURIComponent(options.location)}/templates/${encodeURIComponent(options.templateId)}`;
}

async function callSanitize(
	options: ModelArmorClientOptions,
	method: 'sanitizeUserPrompt' | 'sanitizeModelResponse',
	body: unknown
): Promise<ArmorClientResult> {
	const token = options.token() ?? '';
	const url = `${templateUrl(options)}:${method}`;
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), options.timeoutMs);

	let response: Response;
	try {
		response = await options.fetch(url, {
			method: 'POST',
			headers: {
				authorization: `Bearer ${token}`,
				'content-type': 'application/json'
			},
			body: JSON.stringify(body),
			signal: controller.signal
		});
	} catch (cause) {
		const error = isAbortError(cause)
			? armorErrorFromTimeout(options.timeoutMs)
			: armorErrorFromNetworkFailure(cause);
		return { error: scrubToken(error, token) };
	} finally {
		clearTimeout(timer);
	}

	if (!response.ok) {
		const message = await safeMessage(response);
		return { error: scrubToken(armorErrorFromStatus(response.status, message), token) };
	}

	let json: unknown;
	try {
		json = await response.json();
	} catch {
		return {
			error: scrubToken(
				{ kind: 'unavailable' as const, message: 'The guard sent a response we could not read.' },
				token
			)
		};
	}

	try {
		return { reading: readSanitizationResult(json) };
	} catch {
		return {
			error: scrubToken(
				{
					kind: 'unavailable' as const,
					message: 'The guard sent a response shaped unlike Model Armor.'
				},
				token
			)
		};
	}
}

/** `AbortController.abort()` rejects `fetch` with an `AbortError`, in both browsers and Node's `fetch`. */
function isAbortError(cause: unknown): boolean {
	return cause instanceof Error && cause.name === 'AbortError';
}

async function safeMessage(response: Response): Promise<string> {
	try {
		const body = (await response.json()) as { error?: { message?: unknown } };
		if (typeof body.error?.message === 'string') return body.error.message;
	} catch {
		// fall through to the generic message below
	}
	return `The guard returned ${response.status}.`;
}

export function createModelArmorClient(options: ModelArmorClientOptions): ArmorClient {
	return {
		sanitizeUserPrompt: (text) =>
			callSanitize(options, 'sanitizeUserPrompt', { userPromptData: { text } }),
		sanitizeModelResponse: (text, userPrompt) =>
			callSanitize(options, 'sanitizeModelResponse', {
				modelResponseData: { text },
				...(userPrompt !== undefined ? { userPrompt } : {})
			})
	};
}

/** No network call, ever — every screen reads as clean. `25-…` §4.5/§6: reproduces the golden trace with `offline: true`. */
export function createOfflineArmorClient(): ArmorClient {
	const clean = async (): Promise<ArmorClientResult> => ({
		reading: readSanitizationResult(fixtureClean)
	});
	return { sanitizeUserPrompt: clean, sanitizeModelResponse: clean };
}
