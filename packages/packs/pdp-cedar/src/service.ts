import type {
	ExternalOutcomeKind,
	GuardrailService,
	GuardrailServiceClient,
	ScreenFinding,
	ScreenReading,
	ScreenRequest,
	ScreenResult
} from '@craftabot/core';
import type { PdpInput } from '@craftabot/governance';
import { parseCredential, scrubSecret, signRequest } from '@craftabot/pack-bedrock-guardrails';
import { z } from 'zod';
import { fixtures } from './fixtures/index.js';

/**
 * **Cedar on the shell** (WP144, `110-CONTROL-SUITE-PLAN.md` §10): Amazon
 * Verified Permissions' `IsAuthorized` — the managed Cedar decision point —
 * as a policy decision point at `pre-act`, beside OPA. The request's
 * `policyInput` (the document governance builds for any PDP, `pdp.ts`) is
 * mapped to Cedar's principal, action, resource and context: the bot is the
 * principal, the call it proposes is the action, the goal card is the
 * resource, and the tick, the hook and the world's predicates are the
 * context. A `DENY` is a policy violation named by the policies that
 * determined it; a deny with no determining policy is Cedar's default deny,
 * read the same way. Signed with SigV4, so the harness runs it — **connectable,
 * checkpoint pending** until someone with a policy store runs
 * `npm run smoke:cedar`.
 */
export const CEDAR_CREDENTIAL_ID = 'aws-verified-permissions';
export const SERVICE_ID = 'pdp-cedar/verified-permissions';
export const RECORD_SERVICE = 'verified-permissions';

const FIXTURE_NAMES = ['allow', 'deny', 'deny-by-default', 'evaluation-error'] as const;

export const cedarConfigSchema = z.object({
	region: z
		.string()
		.regex(/^[a-z]{2}-[a-z]+-\d$/, { message: 'an AWS region looks like eu-west-2' }),
	policyStoreId: z.string().min(1),
	/** The Cedar namespace the entity types live in: `CraftABot::Agent`, `CraftABot::Action`. */
	namespace: z
		.string()
		.regex(/^[A-Z][A-Za-z0-9]*$/, { message: 'a Cedar namespace is one identifier: CraftABot' })
		.default('CraftABot'),
	/** Which canned decision the offline client answers with — the rack's fixture test and CI. */
	offlineFixture: z.enum(FIXTURE_NAMES).optional()
});
export type CedarConfig = z.infer<typeof cedarConfigSchema>;

/** `IsAuthorized`'s answer, the parts the shell reads. */
export const isAuthorizedResponseSchema = z.object({
	decision: z.enum(['ALLOW', 'DENY']),
	determiningPolicies: z.array(z.object({ policyId: z.string() })).default([]),
	errors: z.array(z.object({ errorDescription: z.string() })).default([])
});
export type IsAuthorizedResponse = z.infer<typeof isAuthorizedResponseSchema>;

type CedarValue =
	| { string: string }
	| { long: number }
	| { boolean: boolean }
	| { record: Record<string, CedarValue> };

/** The PDP document as an `IsAuthorized` request. */
export function isAuthorizedRequest(input: PdpInput, config: CedarConfig): Record<string, unknown> {
	const ns = config.namespace;
	const predicates: Record<string, CedarValue> = {};
	for (const [id, holds] of Object.entries(input.world.predicates))
		predicates[id.replace(/[^A-Za-z0-9_]/g, '_')] = { boolean: holds };
	const context: Record<string, CedarValue> = {
		tick: { long: input.tick },
		hook: { string: input.hook },
		predicates: { record: predicates },
		...(input.proposed
			? {
					callKind: { string: input.proposed.kind },
					arguments: { string: JSON.stringify(input.proposed.arguments ?? null) }
				}
			: {})
	};
	return {
		policyStoreId: config.policyStoreId,
		principal: { entityType: `${ns}::Agent`, entityId: input.agent.id },
		action: { actionType: `${ns}::Action`, actionId: input.proposed?.name ?? 'none' },
		resource: { entityType: `${ns}::GoalCard`, entityId: input.agent.goalCardId || 'none' },
		context: { contextMap: context }
	};
}

/** A decision in the shell's vocabulary. */
export function readDecision(response: IsAuthorizedResponse): ScreenReading {
	const denied = response.decision === 'DENY';
	const findings: ScreenFinding[] =
		response.determiningPolicies.length > 0
			? response.determiningPolicies.map((policy) => ({
					category: 'policy-violation',
					vendorLabel: policy.policyId,
					ran: true,
					matched: denied
				}))
			: [
					{
						category: 'policy-violation',
						vendorLabel: denied ? 'default-deny' : 'allow',
						ran: true,
						matched: denied
					}
				];
	return {
		// An evaluation error is a reading the shell cannot trust: partial, never an allow.
		outcome: response.errors.length > 0 ? 'partial' : 'ok',
		matched: denied,
		findings
	};
}

export interface CedarError {
	kind: ExternalOutcomeKind;
	message: string;
}
export type CallResult = { body: IsAuthorizedResponse } | { error: CedarError };

export interface CedarClient {
	isAuthorized(request: Record<string, unknown>, signal?: AbortSignal): Promise<CallResult>;
}

export function describeEndpoint(config: Pick<CedarConfig, 'region'>): string {
	return `https://verifiedpermissions.${config.region}.amazonaws.com/`;
}

function errorFromStatus(status: number, message: string): CedarError {
	if (status === 401 || status === 403)
		return { kind: status === 401 ? 'bad-token' : 'no-permission', message };
	if (status === 404) return { kind: 'no-template', message };
	if (status === 429) return { kind: 'quota', message };
	return { kind: 'unavailable', message };
}

export function createCedarClient(options: {
	config: Pick<CedarConfig, 'region'>;
	fetch: typeof globalThis.fetch;
	credential: () => string | undefined;
	now?: () => Date;
}): CedarClient {
	return {
		async isAuthorized(request, signal) {
			const secret = options.credential();
			const scrub = (error: CedarError): CedarError => ({
				kind: error.kind,
				message: scrubSecret(error.message, secret)
			});
			const credentials = parseCredential(secret);
			if (!credentials)
				return {
					error: {
						kind: 'bad-token',
						message:
							'No AWS credential: the vault entry is accessKeyId:secretAccessKey[:sessionToken].'
					}
				};
			const url = new URL(describeEndpoint(options.config));
			const body = JSON.stringify(request);
			const signed = signRequest(
				{
					method: 'POST',
					url,
					body,
					region: options.config.region,
					service: 'verifiedpermissions',
					...(options.now ? { now: options.now() } : {})
				},
				credentials
			);
			let response: Response;
			try {
				response = await options.fetch(url, {
					method: 'POST',
					headers: {
						...signed,
						'content-type': 'application/x-amz-json-1.0',
						'x-amz-target': 'VerifiedPermissions.IsAuthorized'
					},
					body,
					...(signal ? { signal } : {})
				});
			} catch (cause) {
				const aborted = cause instanceof Error && cause.name === 'AbortError';
				return {
					error: scrub({
						kind: aborted ? 'timeout' : 'unavailable',
						message: aborted
							? 'Verified Permissions took too long to answer.'
							: cause instanceof Error
								? cause.message
								: 'Verified Permissions could not be reached.'
					})
				};
			}
			if (!response.ok) {
				let message = `Verified Permissions returned ${response.status}.`;
				try {
					const raw = (await response.json()) as { message?: unknown; Message?: unknown };
					if (typeof raw.message === 'string') message = raw.message;
					else if (typeof raw.Message === 'string') message = raw.Message;
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
						message: 'Verified Permissions sent a body we could not read.'
					})
				};
			}
			const parsed = isAuthorizedResponseSchema.safeParse(raw);
			if (!parsed.success)
				return {
					error: scrub({
						kind: 'unavailable',
						message: 'Verified Permissions answered unlike IsAuthorized does.'
					})
				};
			return { body: parsed.data };
		}
	};
}

export function cedarServiceClient(
	client: CedarClient,
	config: CedarConfig
): GuardrailServiceClient {
	return {
		async screen(request: ScreenRequest, signal?: AbortSignal): Promise<ScreenResult> {
			const record = {
				service: RECORD_SERVICE,
				method: 'IsAuthorized',
				endpoint: describeEndpoint(config),
				policyRef: config.policyStoreId
			};
			if (request.policyInput === undefined)
				return {
					error: {
						kind: 'unavailable',
						message: 'No policy input on the request — the host predates the PDP seam.'
					},
					record
				};
			const answer = await client.isAuthorized(
				isAuthorizedRequest(request.policyInput as PdpInput, config),
				signal
			);
			if ('error' in answer) return { error: answer.error, record };
			return { reading: readDecision(answer.body), record };
		}
	};
}

function offlineClient(fixture: (typeof FIXTURE_NAMES)[number]): CedarClient {
	return {
		isAuthorized: () =>
			Promise.resolve({ body: isAuthorizedResponseSchema.parse(fixtures[fixture]) })
	};
}

export const cedarService: GuardrailService = {
	id: SERVICE_ID,
	name: 'Cedar (Verified Permissions)',
	description:
		'Amazon Verified Permissions’ IsAuthorized: each proposed call asked of a Cedar policy store — the bot as principal, the call as action, the goal card as resource — signed with SigV4, so the harness runs it.',
	hooks: ['pre-act'],
	credential: {
		id: CEDAR_CREDENTIAL_ID,
		name: 'AWS access key (accessKeyId:secretAccessKey)',
		kind: 'header',
		headerName: 'Authorization',
		keysUrl: 'https://console.aws.amazon.com/iam/'
	},
	egress: [
		{
			host: 'verifiedpermissions.*.amazonaws.com',
			purpose: 'policy decisions',
			sends: ['decision', 'credential-header']
		}
	],
	configSchema: cedarConfigSchema,
	browserCapable: false,
	create: ({ config, fetch, getCredential }) => {
		const parsed = cedarConfigSchema.parse(config);
		return cedarServiceClient(
			createCedarClient({
				config: parsed,
				fetch,
				credential: () => getCredential(CEDAR_CREDENTIAL_ID)
			}),
			parsed
		);
	},
	createOffline: (config) => {
		const parsed = cedarConfigSchema.parse(config);
		return cedarServiceClient(offlineClient(parsed.offlineFixture ?? 'allow'), parsed);
	}
};
