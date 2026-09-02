import type {
	GuardrailService,
	GuardrailServiceClient,
	ScreenReading,
	ScreenRequest,
	ScreenResult
} from '@craftabot/core';
import { z } from 'zod';
import {
	DEFAULT_OLLAMA_ENDPOINT,
	cannedOllamaClient,
	createOllamaClient,
	describeOllamaEndpoint,
	ollamaEndpointSchema,
	type OllamaClient
} from './ollama.js';

/**
 * **A prompt-injection classifier, served by your own Ollama** (`30-…` D2 and
 * its caveat): the service names a model and parses one label out of its
 * answer — `BENIGN`, `INJECTION` or `JAILBREAK`, Prompt Guard's own
 * vocabulary. Llama Prompt Guard 2 is a sequence classifier rather than a
 * chat model, so a user serves it behind a Modelfile (or names any model
 * prompted to answer in those three words); the fixtures, not a live model,
 * are what CI runs.
 */

export const PROMPT_GUARD_SERVICE_ID = 'guard-local/prompt-guard';
export const PROMPT_GUARD_RECORD_SERVICE = 'prompt-guard';

export const promptGuardConfigSchema = z.object({
	endpoint: ollamaEndpointSchema.default(DEFAULT_OLLAMA_ENDPOINT),
	model: z.string().min(1).default('llama-prompt-guard-2'),
	/** Wrapped around the text when the model needs telling how to answer; `{text}` is replaced. Empty for a true classifier. */
	promptTemplate: z.string().default('')
});
export type PromptGuardConfig = z.infer<typeof promptGuardConfigSchema>;

const LABELS = ['BENIGN', 'INJECTION', 'JAILBREAK'] as const;

/** The first known label in the answer wins; no known label is a partial reading, never a match. */
export function readPromptGuard(text: string): ScreenReading {
	const upper = text.toUpperCase();
	const label = LABELS.find((candidate) => new RegExp(`\\b${candidate}\\b`).test(upper));
	const known = label !== undefined;
	return {
		outcome: known ? 'ok' : 'partial',
		matched: label === 'INJECTION' || label === 'JAILBREAK',
		findings: [
			{
				category: 'injection',
				vendorLabel: 'INJECTION',
				ran: known,
				matched: label === 'INJECTION'
			},
			{
				category: 'jailbreak',
				vendorLabel: 'JAILBREAK',
				ran: known,
				matched: label === 'JAILBREAK'
			}
		]
	};
}

export function promptGuardServiceClient(
	client: OllamaClient,
	config: PromptGuardConfig
): GuardrailServiceClient {
	return {
		async screen(request: ScreenRequest, signal?: AbortSignal): Promise<ScreenResult> {
			const record = {
				service: PROMPT_GUARD_RECORD_SERVICE,
				method: 'generate',
				endpoint: describeOllamaEndpoint(config.endpoint, 'generate'),
				policyRef: config.model
			};
			const prompt =
				config.promptTemplate === ''
					? request.text
					: config.promptTemplate.replace('{text}', request.text);
			const result = await client.generate(config.model, prompt, signal);
			if ('error' in result) return { error: result.error, record };
			return { reading: readPromptGuard(result.text), record };
		}
	};
}

export const promptGuardService: GuardrailService = {
	id: PROMPT_GUARD_SERVICE_ID,
	name: 'Prompt Guard (local)',
	description:
		'A prompt-injection classifier running on your own machine through Ollama — benign, injection or jailbreak — no key, nothing leaves the computer.',
	hooks: ['pre-think', 'pre-act', 'post-act'],
	egress: [
		{
			host: 'localhost',
			purpose: 'content screening',
			sends: ['observation', 'decision', 'result']
		},
		{
			host: '127.0.0.1',
			purpose: 'content screening',
			sends: ['observation', 'decision', 'result']
		}
	],
	/** Ollama answers a browser only when started with `OLLAMA_ORIGINS` set — off by default, so the harness is the live host. */
	browserCapable: false,
	configSchema: promptGuardConfigSchema,
	create: ({ config, fetch }) => {
		const parsed = promptGuardConfigSchema.parse(config);
		return promptGuardServiceClient(
			createOllamaClient({ endpoint: parsed.endpoint, fetch }),
			parsed
		);
	},
	createOffline: (config) =>
		promptGuardServiceClient(cannedOllamaClient('BENIGN'), promptGuardConfigSchema.parse(config))
};
