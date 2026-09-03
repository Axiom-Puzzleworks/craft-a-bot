import {
	armorErrorFromNetworkFailure,
	armorErrorFromStatus,
	armorErrorFromTimeout,
	scrubToken
} from '../armor/errors.js';
import type { ArmorError } from '../armor/errors.js';

/**
 * **The Gen AI evaluation service's REST client** (`39-HOSTED-EVALUATOR.md`
 * §4.1, WP51): `POST {location}-aiplatform.googleapis.com/v1/projects/…/
 * locations/…:evaluateInstances`, one metric per request. The same discipline
 * as `armor/client.ts` — a regional URL only, the bearer token from a thunk
 * and trimmed, never throws, every message through `scrubToken` — and the
 * same closed error kinds, which are HTTP's rather than Model Armor's.
 */

export interface EvalClientOptions {
	projectId: string;
	location: string;
	timeoutMs: number;
	fetch: typeof globalThis.fetch;
	token: () => string | undefined;
}

export type EvalClientResult = { response: unknown } | { error: ArmorError };

export interface EvalClient {
	evaluate(request: unknown): Promise<EvalClientResult>;
}

/** The exact URL a call hits — on the trace as the record's `endpoint`. */
export function describeEvalEndpoint(
	options: Pick<EvalClientOptions, 'projectId' | 'location'>
): string {
	const location = encodeURIComponent(options.location);
	return `https://${location}-aiplatform.googleapis.com/v1/projects/${encodeURIComponent(options.projectId)}/locations/${location}:evaluateInstances`;
}

function isAbortError(cause: unknown): boolean {
	return cause instanceof Error && cause.name === 'AbortError';
}

async function safeMessage(response: Response): Promise<string> {
	try {
		const text = await response.text();
		try {
			const json = JSON.parse(text) as { error?: { message?: string } };
			return json.error?.message ?? text;
		} catch {
			return text;
		}
	} catch {
		return `HTTP ${response.status}`;
	}
}

export function createEvalClient(options: EvalClientOptions): EvalClient {
	return {
		async evaluate(request) {
			const token = (options.token() ?? '').trim();
			const url = describeEvalEndpoint(options);
			const controller = new AbortController();
			const timer = setTimeout(() => controller.abort(), options.timeoutMs);

			let response: Response;
			try {
				response = await options.fetch(url, {
					method: 'POST',
					headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
					body: JSON.stringify(request),
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
			try {
				return { response: scrubToken(await response.json(), token) };
			} catch {
				return {
					error: scrubToken(
						{
							kind: 'unavailable',
							message: 'The evaluation service sent a response we could not read.'
						},
						token
					)
				};
			}
		}
	};
}
