import type { ExternalOutcomeKind } from '@craftabot/core';
import { z } from 'zod';

/**
 * The one client both local services share (`30-…` D2): Ollama's native
 * `/api/chat` and `/api/generate`, non-streaming, on the user's own machine.
 * No credential, so nothing to scrub; **never throws** — a model that is not
 * pulled, a daemon that is not running and a body that is not JSON are all
 * typed errors for the shell's `onFailure` dial.
 */

export const DEFAULT_OLLAMA_ENDPOINT = 'http://localhost:11434';

export const ollamaEndpointSchema = z
	.string()
	.url()
	.refine((url) => /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/i.test(url), {
		message:
			'a local guard runs on your own machine: http://localhost:11434 or http://127.0.0.1:11434'
	});

export interface OllamaError {
	kind: ExternalOutcomeKind;
	message: string;
}

export type OllamaResult = { text: string } | { error: OllamaError };

const chatResponseSchema = z.object({ message: z.object({ content: z.string() }) });
const generateResponseSchema = z.object({ response: z.string() });

export function describeOllamaEndpoint(endpoint: string, api: 'chat' | 'generate'): string {
	return `${endpoint.replace(/\/+$/, '')}/api/${api}`;
}

async function call(
	fetchImpl: typeof globalThis.fetch,
	endpoint: string,
	api: 'chat' | 'generate',
	body: unknown,
	signal: AbortSignal | undefined
): Promise<OllamaResult> {
	let response: Response;
	try {
		response = await fetchImpl(describeOllamaEndpoint(endpoint, api), {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body),
			...(signal ? { signal } : {})
		});
	} catch (cause) {
		const aborted = cause instanceof Error && cause.name === 'AbortError';
		return {
			error: {
				kind: aborted ? 'timeout' : 'unavailable',
				message: aborted
					? 'The local guard took too long to answer.'
					: 'The local guard could not be reached — is Ollama running?'
			}
		};
	}
	if (!response.ok) {
		let message = `Ollama returned ${response.status}.`;
		try {
			const raw = (await response.json()) as { error?: unknown };
			if (typeof raw.error === 'string') message = raw.error;
		} catch {
			// the generic message stands
		}
		// A model that is not pulled is Ollama's 404: the closest kind is "the policy could not be found".
		return { error: { kind: response.status === 404 ? 'no-template' : 'unavailable', message } };
	}
	let raw: unknown;
	try {
		raw = await response.json();
	} catch {
		return { error: { kind: 'unavailable', message: 'Ollama sent a body we could not read.' } };
	}
	const parsed =
		api === 'chat' ? chatResponseSchema.safeParse(raw) : generateResponseSchema.safeParse(raw);
	if (!parsed.success) {
		return {
			error: {
				kind: 'unavailable',
				message: `Ollama's ${api} answer was shaped unlike we expected.`
			}
		};
	}
	return { text: 'message' in parsed.data ? parsed.data.message.content : parsed.data.response };
}

export interface OllamaClient {
	chat(model: string, content: string, signal?: AbortSignal): Promise<OllamaResult>;
	generate(model: string, prompt: string, signal?: AbortSignal): Promise<OllamaResult>;
}

export function createOllamaClient(options: {
	endpoint: string;
	fetch: typeof globalThis.fetch;
}): OllamaClient {
	return {
		chat: (model, content, signal) =>
			call(
				options.fetch,
				options.endpoint,
				'chat',
				{ model, messages: [{ role: 'user', content }], stream: false },
				signal
			),
		generate: (model, prompt, signal) =>
			call(options.fetch, options.endpoint, 'generate', { model, prompt, stream: false }, signal)
	};
}

/** A client that answers every call with one canned line and never touches the network. */
export function cannedOllamaClient(text: string): OllamaClient {
	const answer = () => Promise.resolve({ text });
	return { chat: answer, generate: answer };
}
