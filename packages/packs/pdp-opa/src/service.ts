import type {
	GuardrailService,
	GuardrailServiceClient,
	ScreenRequest,
	ScreenResult
} from '@craftabot/core';
import { z } from 'zod';
import {
	DEFAULT_DECISION_PATH,
	DEFAULT_OPA_URL,
	createOpaClient,
	decisionPathSchema,
	describeDecisionEndpoint,
	opaUrlSchema,
	type OpaClient
} from './client.js';
import { fixtures, type FixtureName } from './fixtures/index.js';
import { readDecision } from './reading.js';
import { SERVICE_DESCRIPTION, SERVICE_NAME } from './strings.js';

/**
 * **OPA as a guard service** (`33-POLICY-V2-PDP.md` §4.3, WP45; `19-…` #14
 * in hosted form). One hook, `pre-act`; the request's `policyInput` — the
 * document governance builds — is the whole input; the decision's
 * violations are `policy-violation` findings named by policy id. No new
 * mechanism: the shell measures, records and decides exactly as it does
 * for a content filter.
 */

export const SERVICE_ID = 'pdp-opa/opa';
export const RECORD_SERVICE = 'opa';

export const opaConfigSchema = z.object({
	url: opaUrlSchema.default(DEFAULT_OPA_URL),
	decisionPath: decisionPathSchema.default(DEFAULT_DECISION_PATH),
	/** Which canned decision the offline client answers with — the rack's fixture test and CI. */
	fixture: z.enum(['allow', 'deny', 'undefined']).default('allow')
});
export type OpaConfig = z.infer<typeof opaConfigSchema>;

export function opaServiceClient(client: OpaClient, config: OpaConfig): GuardrailServiceClient {
	return {
		async screen(request: ScreenRequest, signal?: AbortSignal): Promise<ScreenResult> {
			const record = {
				service: RECORD_SERVICE,
				method: 'v1/data',
				endpoint: describeDecisionEndpoint(config.url, config.decisionPath),
				policyRef: config.decisionPath
			};
			if (request.policyInput === undefined) {
				return {
					error: {
						kind: 'unavailable',
						message: 'No policy input on the request — the host predates the PDP seam.'
					},
					record
				};
			}
			const answer = await client.decide(request.policyInput, signal);
			if ('error' in answer) return { error: answer.error, record };
			const read = readDecision(answer.body);
			if ('error' in read) return { error: read.error, record };
			return { reading: read.reading, record };
		}
	};
}

function offlineClient(fixture: FixtureName): OpaClient {
	return { decide: () => Promise.resolve({ body: fixtures[fixture] }) };
}

export const opaService: GuardrailService = {
	id: SERVICE_ID,
	name: SERVICE_NAME,
	description: SERVICE_DESCRIPTION,
	hooks: ['pre-act'],
	egress: [
		{ host: 'localhost', purpose: 'policy decisions', sends: ['decision'] },
		{ host: '127.0.0.1', purpose: 'policy decisions', sends: ['decision'] }
	],
	configSchema: opaConfigSchema,
	// OPA on localhost answers a browser only with CORS enabled on its side; the rack's live test says so when it fails.
	browserCapable: true,
	create: ({ config, fetch }) => {
		const parsed = opaConfigSchema.parse(config);
		return opaServiceClient(
			createOpaClient({ url: parsed.url, decisionPath: parsed.decisionPath, fetch }),
			parsed
		);
	},
	createOffline: (config) => {
		const parsed = opaConfigSchema.parse(config);
		return opaServiceClient(offlineClient(parsed.fixture), parsed);
	}
};
