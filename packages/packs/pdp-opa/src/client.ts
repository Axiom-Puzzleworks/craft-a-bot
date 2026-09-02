import type { ExternalOutcomeKind } from '@craftabot/core';
import { z } from 'zod';

/**
 * **The OPA Data API client** (`33-POLICY-V2-PDP.md` §4.3, WP45): one call,
 * `POST {url}/v1/data/{decisionPath}` with `{ "input": … }`, answered with
 * `{ "result": … }` — or `{}` when the document is undefined, which is how
 * OPA says "no policy answers here". No credential: OPA on your own machine
 * has none by default, and the endpoint schema keeps it there.
 */

export const DEFAULT_OPA_URL = 'http://localhost:8181';
export const DEFAULT_DECISION_PATH = 'craftabot/decision';

export const opaUrlSchema = z
	.string()
	.url()
	.refine((url) => /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/i.test(url), {
		message: 'a local policy engine runs on your own machine: http://localhost:8181'
	});

export const decisionPathSchema = z
	.string()
	.min(1)
	.regex(/^[a-zA-Z0-9_]+(\/[a-zA-Z0-9_]+)*$/, {
		message: 'a decision path is package segments joined by slashes: craftabot/decision'
	});

export interface OpaError {
	kind: ExternalOutcomeKind;
	message: string;
}

export type OpaResult = { body: unknown } | { error: OpaError };

export function describeDecisionEndpoint(url: string, decisionPath: string): string {
	return `${url.replace(/\/+$/, '')}/v1/data/${decisionPath}`;
}

export interface OpaClient {
	decide(input: unknown, signal?: AbortSignal): Promise<OpaResult>;
}

export function createOpaClient(options: {
	url: string;
	decisionPath: string;
	fetch: typeof globalThis.fetch;
}): OpaClient {
	const endpoint = describeDecisionEndpoint(options.url, options.decisionPath);
	return {
		async decide(input, signal) {
			let response: Response;
			try {
				response = await options.fetch(endpoint, {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ input }),
					...(signal ? { signal } : {})
				});
			} catch (cause) {
				const aborted = cause instanceof Error && cause.name === 'AbortError';
				return {
					error: {
						kind: aborted ? 'timeout' : 'unavailable',
						message: aborted
							? 'The policy engine took too long to answer.'
							: 'The policy engine could not be reached — is OPA running?'
					}
				};
			}
			if (!response.ok) {
				let message = `OPA returned ${response.status}.`;
				try {
					const raw = (await response.json()) as { message?: unknown };
					if (typeof raw.message === 'string') message = raw.message;
				} catch {
					// the generic message stands
				}
				return {
					error: { kind: response.status === 404 ? 'no-template' : 'unavailable', message }
				};
			}
			try {
				return { body: await response.json() };
			} catch {
				return {
					error: { kind: 'unavailable', message: 'OPA sent a body we could not read.' }
				};
			}
		}
	};
}
