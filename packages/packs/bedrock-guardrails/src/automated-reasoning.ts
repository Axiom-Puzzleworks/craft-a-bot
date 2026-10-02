import type {
	GuardrailService,
	GuardrailServiceClient,
	ScreenFinding,
	ScreenReading,
	ScreenRequest,
	ScreenResult
} from '@craftabot/core';
import { z } from 'zod';
import { fixtures } from './fixtures/index.js';
import {
	BEDROCK_CREDENTIAL_ID,
	applyGuardrailResponseSchema,
	createBedrockClient,
	describeEndpoint,
	type ApplyGuardrailResponse,
	type BedrockClient
} from './service.js';

/**
 * **Bedrock's automated-reasoning checks on the shell** (WP144,
 * `110-CONTROL-SUITE-PLAN.md` §10; `19-…`'s formal verification). A guardrail
 * with an automated-reasoning policy attached checks what the bot is about to
 * say against rules written as logic: the claims are translated, and each is
 * proved (`valid`), contradicted (`invalid`, `impossible`), left open
 * (`satisfiable`), or could not be judged (`translationAmbiguous`,
 * `tooComplex`, `noTranslations`). It rides the same signed `ApplyGuardrail`
 * call as the content filters, so it is the same connection with another
 * reading: a contradicted claim is a policy violation, and a claim the
 * checker could not translate is a partial reading — never an allow.
 *
 * **Connectable, checkpoint pending.** The adapter meets the documented
 * contract and its stand-in runs in CI; no live answer has been taken, which
 * needs an AWS account with a policy (`npm run smoke:bedrock-ar`).
 */
export const AUTOMATED_REASONING_SERVICE_ID = 'bedrock-guardrails/automated-reasoning';
export const AUTOMATED_REASONING_RECORD_SERVICE = 'bedrock-automated-reasoning';

/** The results the checker gives, and what each means here. */
const PROVED = new Set(['valid']);
const CONTRADICTED = new Set(['invalid', 'impossible']);
const OPEN = new Set(['satisfiable']);

const FIXTURE_NAMES = ['ar-valid', 'ar-invalid', 'ar-ambiguous'] as const;

export const automatedReasoningConfigSchema = z.object({
	region: z
		.string()
		.regex(/^[a-z]{2}-[a-z]+-\d$/, { message: 'an AWS region looks like eu-west-2' }),
	/** A guardrail with an automated-reasoning policy attached. */
	guardrailId: z.string().min(1),
	guardrailVersion: z.string().min(1).default('DRAFT'),
	/** Which canned answer the stand-in serves; `ar-valid` when absent. */
	offlineFixture: z.enum(FIXTURE_NAMES).optional()
});
export type AutomatedReasoningConfig = z.infer<typeof automatedReasoningConfigSchema>;

/** The checker's findings in the shell's vocabulary: one per claim, labelled by its result. */
export function automatedReasoningReading(response: ApplyGuardrailResponse): ScreenReading {
	const findings: ScreenFinding[] = [];
	let undecided = false;
	for (const assessment of response.assessments)
		for (const finding of assessment.automatedReasoningPolicy?.findings ?? []) {
			const result = Object.keys(finding)[0] ?? 'unknown';
			const judged = PROVED.has(result) || CONTRADICTED.has(result) || OPEN.has(result);
			if (!judged) undecided = true;
			findings.push({
				category: 'policy-violation',
				vendorLabel: `ar:${result}`,
				ran: judged,
				matched: CONTRADICTED.has(result),
				...(CONTRADICTED.has(result) ? { confidence: 'high' as const } : {})
			});
		}
	const matched = findings.some((finding) => finding.matched);
	return {
		outcome: findings.length === 0 || (undecided && !matched) ? 'partial' : 'ok',
		matched,
		findings
	};
}

export function automatedReasoningClient(
	client: BedrockClient,
	config: AutomatedReasoningConfig
): GuardrailServiceClient {
	return {
		async screen(request: ScreenRequest, signal?: AbortSignal): Promise<ScreenResult> {
			const record = {
				service: AUTOMATED_REASONING_RECORD_SERVICE,
				endpoint: describeEndpoint(config)
			};
			// The checker judges what the bot is about to say: the model's output.
			const result = await client.apply(request.text, 'OUTPUT', signal);
			if ('error' in result) return { error: result.error, record };
			return { reading: automatedReasoningReading(result.body), record };
		}
	};
}

function offlineClient(fixture: (typeof FIXTURE_NAMES)[number]): BedrockClient {
	return {
		apply: () => Promise.resolve({ body: applyGuardrailResponseSchema.parse(fixtures[fixture]) })
	};
}

export const automatedReasoningService: GuardrailService = {
	id: AUTOMATED_REASONING_SERVICE_ID,
	name: 'Bedrock automated-reasoning checks',
	description:
		'A Bedrock guardrail’s automated-reasoning policy: what the bot is about to say, translated to logic and checked against rules — proved, contradicted, or left open. Signed with SigV4, so the harness runs it.',
	hooks: ['pre-act'],
	credential: {
		id: BEDROCK_CREDENTIAL_ID,
		name: 'AWS access key (accessKeyId:secretAccessKey)',
		kind: 'header',
		headerName: 'Authorization',
		keysUrl: 'https://console.aws.amazon.com/iam/'
	},
	egress: [
		{
			host: 'bedrock-runtime.*.amazonaws.com',
			purpose: 'automated-reasoning checks',
			sends: ['decision', 'credential-header']
		}
	],
	configSchema: automatedReasoningConfigSchema,
	browserCapable: false,
	create: ({ config, fetch, getCredential }) => {
		const parsed = automatedReasoningConfigSchema.parse(config);
		return automatedReasoningClient(
			createBedrockClient({
				config: parsed,
				fetch,
				credential: () => getCredential(BEDROCK_CREDENTIAL_ID)
			}),
			parsed
		);
	},
	createOffline: (config) => {
		const parsed = automatedReasoningConfigSchema.parse(config);
		return automatedReasoningClient(offlineClient(parsed.offlineFixture ?? 'ar-valid'), parsed);
	}
};
