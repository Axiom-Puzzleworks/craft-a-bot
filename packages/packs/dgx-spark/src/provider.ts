import type {
	ChatResponse,
	KeyCheck,
	LLMProvider,
	ProviderError,
	ProviderErrorKind
} from '@craftabot/core';
import {
	buildRequestBody,
	createSseParser,
	createStreamAccumulator,
	streamChunkSchema
} from '@craftabot/pack-ollama';
import { SPARK_PROVIDER_ID } from './catalogue.js';
import { sparkBaseUrls } from './endpoints.js';
import {
	SparkUnavailable,
	createSparkTransport,
	unitKeyOf,
	type SparkTransport
} from './transport.js';

/**
 * **The DGX Spark brain** (`99-DGX-SPARK.md` §5). The LLM brick's provider
 * for the builder's own two Sparks: vLLM's OpenAI-compatible
 * `/v1/chat/completions`, streamed, with tools. There is no key, like
 * Ollama. The wire format is `pack-ollama`'s (OpenAI's, which vLLM
 * speaks), reused rather than copied.
 *
 * Two things differ from Ollama:
 * - The request is routed by `transport.ts` to whichever unit serves the
 *   cartridge's model, and fails over to the other unit.
 * - `chat_template_kwargs: { enable_thinking: false }` is always sent. The
 *   Qwen models otherwise spend the token budget on a reasoning block before
 *   answering (the Spark project's `PUZZLE-LLM-INTEGRATION.md` §3.1). The
 *   Spark's reasoning parser keeps any such block out of `content` anyway.
 */
export class SparkError extends Error {
	readonly kind: ProviderErrorKind;
	readonly providerError: ProviderError;

	constructor(providerError: ProviderError) {
		super(providerError.message);
		this.name = 'SparkError';
		this.kind = providerError.kind;
		this.providerError = providerError;
	}
}

export interface SparkProviderOptions {
	/** Accepted for parity with the other provider packs; unused (no key). */
	apiKey?: string;
	fetch?: typeof globalThis.fetch;
	/** A preferred unit (`spark-ef08`, or its Tailscale address); the other is still the fallback. */
	endpoint?: string;
	transport?: SparkTransport;
	/** Hold every request to one unit, by id (`spark-619c`): a probe asks each unit alone (WP192). Absent, the transport spreads load over the pair. */
	pin?: string;
}

export const SPARK_EXTRA_BODY = { chat_template_kwargs: { enable_thinking: false } } as const;

function httpError(status: number, body: unknown): ProviderError {
	const message =
		typeof (body as { error?: { message?: unknown } } | null)?.error?.message === 'string'
			? ((body as { error: { message: string } }).error.message as string)
			: typeof (body as { message?: unknown } | null)?.message === 'string'
				? ((body as { message: string }).message as string)
				: undefined;
	if (status === 400 && message?.toLowerCase().includes('context'))
		return {
			kind: 'malformed',
			message: `The Spark refused the request: it is longer than the model's context. ${message}`,
			raw: body
		};
	if (status === 429)
		return {
			kind: 'rate-limited',
			message: 'The Spark is busy — try again in a moment.',
			raw: body
		};
	if (status >= 500)
		return {
			kind: 'provider-down',
			message: `The Spark answered ${status}.${message ? ` ${message}` : ''}`,
			raw: body
		};
	return {
		kind: 'malformed',
		message: `The Spark answered ${status}.${message ? ` ${message}` : ''}`,
		raw: body
	};
}

export function createSparkProvider(options: SparkProviderOptions = {}): LLMProvider {
	const doFetch = options.fetch ?? globalThis.fetch.bind(globalThis);
	const transport =
		options.transport ??
		createSparkTransport({
			baseUrls: sparkBaseUrls(options.endpoint),
			fetch: doFetch,
			...(options.pin !== undefined ? { pin: options.pin } : {})
		});

	const fail = (error: ProviderError): never => {
		throw new SparkError(error);
	};

	return {
		id: SPARK_PROVIDER_ID,
		name: 'DGX Spark',
		keyRequirement: 'none',

		/** "Is anything reachable, and what is it serving?" — the check a "test connection" affordance wants. */
		async validateKey(): Promise<KeyCheck> {
			const seen = await transport.survey();
			const up = seen.filter((unit) => unit.models !== 'unreachable');
			if (up.length === 0) return { ok: false, message: 'Neither DGX Spark could be reached.' };
			return {
				ok: true,
				message: up
					.map(
						(unit) =>
							`${new URL(unit.baseUrl).hostname} is serving ${(unit.models as { id: string }[]).map((m) => m.id).join(', ') || 'nothing'}`
					)
					.join('; ')
			};
		},

		async chat(request, opts): Promise<ChatResponse> {
			let response: Response;
			try {
				let route: { baseUrl: string };
				({ response, route } = await transport.post(
					request.model,
					'/chat/completions',
					(model) => ({
						...buildRequestBody(request, model),
						...(request.seed !== undefined ? { seed: request.seed } : {}),
						...SPARK_EXTRA_BODY,
						stream_options: { include_usage: true }
					}),
					opts.signal
				));
				// A recording says which unit answered (WP189); both units serve the model, and nothing else records it.
				opts.onServed?.(unitKeyOf(route.baseUrl));
			} catch (cause) {
				if (cause instanceof SparkUnavailable)
					fail({ kind: 'provider-down', message: cause.message });
				fail({
					kind: 'network',
					message:
						'Could not reach a DGX Spark. Is it on, and is this computer on the same network (or Tailscale)?',
					raw: cause instanceof Error ? { name: cause.name, message: cause.message } : cause
				});
			}
			if (!response!.ok) fail(httpError(response!.status, await safeJson(response!)));
			if (!response!.body) fail({ kind: 'malformed', message: 'The Spark sent no response body.' });
			return readStream(response!.body!, opts.onToken, fail);
		}
	};
}

async function readStream(
	body: ReadableStream<Uint8Array>,
	onToken: ((token: string) => void) | undefined,
	fail: (error: ProviderError) => never
): Promise<ChatResponse> {
	const parser = createSseParser();
	const accumulator = createStreamAccumulator();
	const decoder = new TextDecoder();
	const reader = body.getReader();
	const rawChunks: unknown[] = [];
	let sawAnyChunk = false;
	try {
		for (;;) {
			const { done, value } = await reader.read();
			const frames = done ? parser.flush() : parser.push(decoder.decode(value, { stream: true }));
			for (const frame of frames) {
				const parsed = streamChunkSchema.safeParse(safeParseJson(frame.data));
				if (!parsed.success) continue;
				sawAnyChunk = true;
				rawChunks.push(parsed.data);
				const { textDelta } = accumulator.add(parsed.data);
				if (textDelta && onToken) onToken(textDelta);
			}
			if (done) break;
		}
	} finally {
		reader.releaseLock();
	}
	if (!sawAnyChunk)
		fail({ kind: 'malformed', message: 'The Spark streamed nothing we could read.' });
	return accumulator.finish({ chunks: rawChunks });
}

async function safeJson(response: Response): Promise<unknown> {
	try {
		return await response.json();
	} catch {
		return null;
	}
}

function safeParseJson(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		return undefined;
	}
}
