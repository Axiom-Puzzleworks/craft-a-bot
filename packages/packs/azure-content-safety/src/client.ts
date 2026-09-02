import type { ExternalOutcomeKind } from '@craftabot/core';
import {
	analyzeResponseSchema,
	shieldPromptResponseSchema,
	type AnalyzeResponse,
	type ShieldPromptResponse
} from './reading.js';

/**
 * The Azure AI Content Safety REST client (`30-…` §3). Two calls, both on
 * the resource's own endpoint (`https://<resource>.cognitiveservices.azure.com`),
 * both authenticated by one header the vault holds under
 * `azure-content-safety`. **Never throws**: every call resolves to a body
 * or a typed error, and every message passes through `scrubKey` first.
 */

export const API_VERSION = '2024-09-01';
export const KEY_HEADER = 'Ocp-Apim-Subscription-Key';
export const KEY_REDACTED = '[key-redacted]';

export interface ContentSafetyError {
	kind: ExternalOutcomeKind;
	message: string;
}

export type CallResult<T> = { body: T } | { error: ContentSafetyError };

export interface ContentSafetyClientOptions {
	endpoint: string;
	fetch: typeof globalThis.fetch;
	key: () => string | undefined;
}

export function scrubKey(message: string, key: string): string {
	return key.trim() === '' ? message : message.split(key).join(KEY_REDACTED);
}

export function describeEndpoint(endpoint: string, method: 'shieldPrompt' | 'analyze'): string {
	return `${endpoint.replace(/\/+$/, '')}/contentsafety/text:${method}?api-version=${API_VERSION}`;
}

function errorFromStatus(status: number, message: string): ContentSafetyError {
	if (status === 401) return { kind: 'bad-token', message };
	if (status === 403) return { kind: 'no-permission', message };
	if (status === 404) return { kind: 'no-template', message };
	if (status === 429) return { kind: 'quota', message };
	return { kind: 'unavailable', message };
}

async function call<T>(
	options: ContentSafetyClientOptions,
	method: 'shieldPrompt' | 'analyze',
	body: unknown,
	parse: (raw: unknown) => T,
	signal: AbortSignal | undefined
): Promise<CallResult<T>> {
	const key = (options.key() ?? '').trim();
	const scrub = (error: ContentSafetyError): ContentSafetyError => ({
		kind: error.kind,
		message: scrubKey(error.message, key)
	});
	let response: Response;
	try {
		response = await options.fetch(describeEndpoint(options.endpoint, method), {
			method: 'POST',
			headers: { [KEY_HEADER]: key, 'content-type': 'application/json' },
			body: JSON.stringify(body),
			...(signal ? { signal } : {})
		});
	} catch (cause) {
		const aborted = cause instanceof Error && cause.name === 'AbortError';
		return {
			error: scrub({
				kind: aborted ? 'timeout' : 'unavailable',
				message: aborted
					? 'Content Safety took too long to answer.'
					: cause instanceof Error
						? cause.message
						: 'Content Safety could not be reached.'
			})
		};
	}
	if (!response.ok) {
		let message = `Content Safety returned ${response.status}.`;
		try {
			const raw = (await response.json()) as { error?: { message?: unknown } };
			if (typeof raw.error?.message === 'string') message = raw.error.message;
		} catch {
			// the generic message stands
		}
		return { error: scrub(errorFromStatus(response.status, message)) };
	}
	let raw: unknown;
	try {
		raw = await response.json();
	} catch {
		return {
			error: scrub({
				kind: 'unavailable',
				message: 'Content Safety sent a body we could not read.'
			})
		};
	}
	try {
		return { body: parse(raw) };
	} catch {
		return {
			error: scrub({
				kind: 'unavailable',
				message: `Content Safety's ${method} answer was shaped unlike we expected.`
			})
		};
	}
}

export interface ContentSafetyClient {
	shieldPrompt(
		input: { userPrompt?: string; documents?: string[] },
		signal?: AbortSignal
	): Promise<CallResult<ShieldPromptResponse>>;
	analyze(text: string, signal?: AbortSignal): Promise<CallResult<AnalyzeResponse>>;
}

export function createContentSafetyClient(
	options: ContentSafetyClientOptions
): ContentSafetyClient {
	return {
		shieldPrompt: (input, signal) =>
			call(
				options,
				'shieldPrompt',
				{ userPrompt: input.userPrompt ?? '', documents: input.documents ?? [] },
				(raw) => shieldPromptResponseSchema.parse(raw),
				signal
			),
		analyze: (text, signal) =>
			call(
				options,
				'analyze',
				{ text, outputType: 'FourSeverityLevels' },
				(raw) => analyzeResponseSchema.parse(raw),
				signal
			)
	};
}
