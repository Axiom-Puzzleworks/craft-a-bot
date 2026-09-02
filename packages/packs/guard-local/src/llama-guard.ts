import type {
	FindingCategory,
	GuardrailService,
	GuardrailServiceClient,
	ScreenFinding,
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
 * **Llama Guard, served by your own Ollama, as a `GuardrailService`**
 * (`30-SECOND-VENDORS.md` D2, §4). The model answers `safe`, or `unsafe`
 * followed by the categories it saw (`S1,S9`); the reading turns those
 * fourteen categories into findings in the shell's vocabulary with Llama
 * Guard's own codes kept as the labels. `S4` — child sexual exploitation —
 * always stops the run, as `csam` does for Model Armor.
 */

export const LLAMA_GUARD_SERVICE_ID = 'guard-local/llama-guard';
export const LLAMA_GUARD_RECORD_SERVICE = 'llama-guard';

/** The MLCommons hazard taxonomy Llama Guard 3 and 4 answer in. */
export const LLAMA_GUARD_CATEGORIES: ReadonlyArray<{
	code: string;
	name: string;
	category: FindingCategory;
}> = [
	{ code: 'S1', name: 'Violent Crimes', category: 'harmful' },
	{ code: 'S2', name: 'Non-Violent Crimes', category: 'harmful' },
	{ code: 'S3', name: 'Sex Crimes', category: 'harmful' },
	{ code: 'S4', name: 'Child Exploitation', category: 'harmful' },
	{ code: 'S5', name: 'Defamation', category: 'harmful' },
	{ code: 'S6', name: 'Specialized Advice', category: 'other' },
	{ code: 'S7', name: 'Privacy', category: 'sensitive-data' },
	{ code: 'S8', name: 'Intellectual Property', category: 'policy-violation' },
	{ code: 'S9', name: 'Indiscriminate Weapons', category: 'harmful' },
	{ code: 'S10', name: 'Hate', category: 'harmful' },
	{ code: 'S11', name: 'Self-Harm', category: 'harmful' },
	{ code: 'S12', name: 'Sexual Content', category: 'harmful' },
	{ code: 'S13', name: 'Elections', category: 'other' },
	{ code: 'S14', name: 'Code Interpreter Abuse', category: 'policy-violation' }
];

export const llamaGuardConfigSchema = z.object({
	endpoint: ollamaEndpointSchema.default(DEFAULT_OLLAMA_ENDPOINT),
	/** Any Llama Guard the daemon serves — `llama-guard3`, `llama-guard3:1b`, a Llama Guard 4 tag. */
	model: z.string().min(1).default('llama-guard3')
});
export type LlamaGuardConfig = z.infer<typeof llamaGuardConfigSchema>;

/** `safe` → no category matched; `unsafe\nS1,S9` → those two; anything else → a partial reading. */
export function readLlamaGuard(text: string): ScreenReading {
	const lines = text
		.trim()
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter((line) => line !== '');
	const verdict = (lines[0] ?? '').toLowerCase();
	const flagged = new Set(
		(lines[1] ?? '')
			.split(/[,\s]+/)
			.map((code) => code.trim().toUpperCase())
			.filter((code) => code !== '')
	);
	const known = verdict === 'safe' || verdict === 'unsafe';
	const findings: ScreenFinding[] = LLAMA_GUARD_CATEGORIES.map(({ code, category }) => ({
		category,
		vendorLabel: code,
		ran: known,
		matched: verdict === 'unsafe' && flagged.has(code)
	}));
	return {
		outcome: known ? 'ok' : 'partial',
		matched: findings.some((finding) => finding.matched),
		findings
	};
}

export function llamaGuardServiceClient(
	client: OllamaClient,
	config: LlamaGuardConfig
): GuardrailServiceClient {
	return {
		async screen(request: ScreenRequest, signal?: AbortSignal): Promise<ScreenResult> {
			const record = {
				service: LLAMA_GUARD_RECORD_SERVICE,
				method: 'chat',
				endpoint: describeOllamaEndpoint(config.endpoint, 'chat'),
				policyRef: config.model
			};
			const result = await client.chat(config.model, request.text, signal);
			if ('error' in result) return { error: result.error, record };
			return { reading: readLlamaGuard(result.text), record };
		}
	};
}

export const llamaGuardService: GuardrailService = {
	id: LLAMA_GUARD_SERVICE_ID,
	name: 'Llama Guard (local)',
	description:
		'Llama Guard 3 or 4 running on your own machine through Ollama: fourteen hazard categories, no key, nothing leaves the computer.',
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
	alwaysStop: ['S4'],
	/** Ollama answers a browser only when started with `OLLAMA_ORIGINS` set — off by default, so the harness is the live host. */
	browserCapable: false,
	configSchema: llamaGuardConfigSchema,
	create: ({ config, fetch }) => {
		const parsed = llamaGuardConfigSchema.parse(config);
		return llamaGuardServiceClient(
			createOllamaClient({ endpoint: parsed.endpoint, fetch }),
			parsed
		);
	},
	createOffline: (config) =>
		llamaGuardServiceClient(cannedOllamaClient('safe'), llamaGuardConfigSchema.parse(config))
};
