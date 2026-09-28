import { parseCassetteFile, type ServiceLine, type ToolResult } from '@craftabot/core';
import recording from '../cassettes/typesafe-jev.craftabot-cassette.json' with { type: 'json' };
import type { JevRequest, JevResponse } from './types.js';

/**
 * **The Jev line** (`98-JEV.md` §6–§8): TypeSafe's System One model as a
 * service line — one operation, `system-one`, that sends a state and typed
 * questions and answers with Jev's typed answers, probabilities and
 * confidence as the result's `data`.
 *
 * Like every line (`47-SERVICE-LINES.md`), it goes live only under
 * `craftabot record`, with the egress guard allowing `api.typesafe.ai` and
 * nothing else, and a session or workflow replays the cassette that the
 * recording wrote. That keeps an experiment's runs deterministic, and every
 * answer Jev gave is on file with its latency. A call the cassette has not
 * seen is a loud `cassette-miss` and is never sent.
 *
 * The line is harness-only. TypeSafe's CORS admits its own console alone
 * (probed 2026-09-28, `98-…` §3), and the key must not reach a page anyway
 * (hard rule 2).
 */
export const JEV_LINE_ID = 'typesafe/jev';
export const JEV_OPERATION = 'system-one';
export const TYPESAFE_HOST = 'api.typesafe.ai';
export const TYPESAFE_CREDENTIAL_ID = 'typesafe';

const ENDPOINT = `https://${TYPESAFE_HOST}/v1/systemone`;
/** 429 and 529 are TypeSafe's "back off and retry" (`98-…` §3). */
const RETRYABLE = new Set([429, 529]);
const ATTEMPTS = 4;

export const jevStrings = {
	noKey: 'The TypeSafe key is not set — nothing was sent.',
	unreachable: 'TypeSafe could not be reached.',
	status: (status: number) => `TypeSafe answered ${status}.`,
	malformed: 'TypeSafe answered with something that is not a System One response.',
	noOp: (op: string) => `The Jev line has no "${op}".`,
	badArgs: 'A System One call needs a model, a state and at least one question.'
} as const;

function isRequest(value: unknown): value is JevRequest {
	const args = value as Partial<JevRequest> | undefined;
	return (
		typeof args?.model === 'string' &&
		args.state !== undefined &&
		typeof args.questions === 'object' &&
		args.questions !== null &&
		Object.keys(args.questions).length > 0
	);
}

function isResponse(value: unknown): value is JevResponse {
	const body = value as Partial<JevResponse> | undefined;
	return (
		typeof body?.model === 'string' && typeof body.answers === 'object' && body.answers !== null
	);
}

/** One line per answer, the way a trace reads it: `category=card (0.97)`. */
export function describeAnswers(response: JevResponse): string {
	return Object.entries(response.answers)
		.map(([id, answer]) => {
			switch (answer.type) {
				case 'choice':
					return `${id}=${answer.choice} (${answer.confidence.toFixed(2)})`;
				case 'score':
					return `${id}=${answer.score.toFixed(2)} (${answer.confidence.toFixed(2)})`;
				case 'noul':
					return `${id}=${answer.noul.toFixed(2)}`;
			}
		})
		.join(', ');
}

const wait = (ms: number, signal?: AbortSignal) =>
	new Promise<void>((resolve) => {
		const timer = setTimeout(resolve, ms);
		signal?.addEventListener('abort', () => {
			clearTimeout(timer);
			resolve();
		});
	});

/**
 * One System One call, with TypeSafe's recommended backoff on 429/529 and
 * the `retry-after` header when the response carries one. The result never
 * carries the transport's own words or the key, only a status.
 */
export async function callSystemOne(
	args: unknown,
	deps: {
		fetch: typeof globalThis.fetch;
		getCredential(id: string): string | undefined;
		signal?: AbortSignal;
	}
): Promise<ToolResult> {
	if (!isRequest(args)) return { ok: false, output: jevStrings.badArgs };
	const key = deps.getCredential(TYPESAFE_CREDENTIAL_ID);
	if (!key) return { ok: false, output: jevStrings.noKey };
	for (let attempt = 1; ; attempt += 1) {
		let response: Response;
		try {
			response = await deps.fetch(ENDPOINT, {
				method: 'POST',
				headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
				body: JSON.stringify(args),
				...(deps.signal ? { signal: deps.signal } : {})
			});
		} catch {
			return { ok: false, output: jevStrings.unreachable };
		}
		if (RETRYABLE.has(response.status) && attempt < ATTEMPTS) {
			const after = Number(response.headers.get('retry-after'));
			await wait(
				Number.isFinite(after) && after > 0 ? after * 1000 : 500 * 2 ** attempt,
				deps.signal
			);
			continue;
		}
		if (!response.ok) return { ok: false, output: jevStrings.status(response.status) };
		let body: unknown;
		try {
			body = await response.json();
		} catch {
			return { ok: false, output: jevStrings.malformed };
		}
		if (!isResponse(body)) return { ok: false, output: jevStrings.malformed };
		return { ok: true, output: describeAnswers(body), data: body };
	}
}

export const jevLine: ServiceLine = {
	id: JEV_LINE_ID,
	name: 'Jev (TypeSafe)',
	description:
		'TypeSafe’s System One model: a state and typed questions in, typed answers with calibrated probabilities out. Recorded; harness-only.',
	operations: [
		{
			id: JEV_OPERATION,
			name: 'Ask Jev',
			description:
				'Evaluate a state against typed questions (choice, score, noul) and return one typed answer per question, with probabilities and a confidence. Read-only.',
			parameters: {
				type: 'object',
				properties: {
					model: { type: 'string', description: 'A versioned model id: jev-1.13.0.' },
					state: { description: 'The text or JSON to judge.' },
					questions: { type: 'object', description: 'Named typed questions.' }
				},
				required: ['model', 'state', 'questions']
			},
			riskTier: 'observe'
		}
	],
	cassette: parseCassetteFile(recording),
	live: {
		browserCapable: false,
		credential: {
			id: TYPESAFE_CREDENTIAL_ID,
			name: 'TypeSafe API key',
			kind: 'bearer-token',
			keysUrl: 'https://console.typesafe.ai/keys'
		},
		egress: [
			{
				host: TYPESAFE_HOST,
				purpose: 'typed judgments over the caller’s words (Jev)',
				sends: ['observation', 'credential-header']
			}
		],
		async call(op, args, deps) {
			if (op !== JEV_OPERATION) return { ok: false, output: jevStrings.noOp(op) };
			return callSystemOne(args, deps);
		}
	}
};
