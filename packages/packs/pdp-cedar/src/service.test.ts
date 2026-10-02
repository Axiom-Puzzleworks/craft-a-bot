import { describe, expect, it } from 'vitest';
import type { GuardrailContext, ScreenRequest } from '@craftabot/core';
import type { PdpInput } from '@craftabot/governance';
import { describeConformance } from '@craftabot/pack-testkit';
import { fixtures } from './fixtures/index.js';
import pack from './index.js';
import {
	cedarConfigSchema,
	cedarService,
	createCedarClient,
	isAuthorizedRequest,
	isAuthorizedResponseSchema,
	readDecision
} from './service.js';

/**
 * Cedar through Verified Permissions on the shell (WP144): the PDP document
 * mapped to principal, action, resource and context; a deny read as a
 * violation named by its policies, the default deny too; an evaluation error
 * never an allow; the request signed and targeted; the credential scrubbed
 * from every error; the conformance kit's checks; not browser-capable.
 */
const CONFIG = cedarConfigSchema.parse({ region: 'eu-west-2', policyStoreId: 'ps-stand-in' });
const SECRET = 'AKIAPLANTEDKEYID1234:plantedSecretAccessKey0123456789abcdef';
const INPUT: PdpInput = {
	version: 1,
	hook: 'pre-act',
	tick: 3,
	agent: { id: 'bot-1', name: 'Deskbot', goalCardId: 'fs-lending/decide' },
	proposed: { kind: 'tool', name: 'connector_crm_close-account', arguments: { id: 'A1' } },
	usage: { ticks: 3, inputTokens: 0, outputTokens: 0 },
	world: { predicates: { 'identity-verified': true } }
};
const request = (overrides: Partial<ScreenRequest> = {}): ScreenRequest => ({
	hook: 'pre-act',
	text: 'close the account',
	envelope: { agentId: 'a', tick: 1 },
	policyInput: INPUT,
	...overrides
});

function fetchFrom(answer: unknown, status = 200) {
	const calls: Array<{ url: string; body: unknown; headers: Record<string, string> }> = [];
	const fetchImpl: typeof fetch = (input, init) => {
		const headers: Record<string, string> = {};
		new Headers(init?.headers).forEach((value, key) => (headers[key] = value));
		calls.push({ url: String(input), body: JSON.parse(String(init?.body)), headers });
		return Promise.resolve(new Response(JSON.stringify(answer), { status }));
	};
	return { fetchImpl, calls };
}

describe('Cedar through Verified Permissions (WP144)', () => {
	it('maps the PDP document onto Cedar’s principal, action, resource and context', () => {
		expect(isAuthorizedRequest(INPUT, CONFIG)).toEqual({
			policyStoreId: 'ps-stand-in',
			principal: { entityType: 'CraftABot::Agent', entityId: 'bot-1' },
			action: { actionType: 'CraftABot::Action', actionId: 'connector_crm_close-account' },
			resource: { entityType: 'CraftABot::GoalCard', entityId: 'fs-lending/decide' },
			context: {
				contextMap: {
					tick: { long: 3 },
					hook: { string: 'pre-act' },
					predicates: { record: { identity_verified: { boolean: true } } },
					callKind: { string: 'tool' },
					arguments: { string: '{"id":"A1"}' }
				}
			}
		});
		const bare = isAuthorizedRequest(
			{ ...INPUT, proposed: undefined, agent: { ...INPUT.agent, goalCardId: '' } } as PdpInput,
			CONFIG
		);
		expect(bare).toMatchObject({
			action: { actionId: 'none' },
			resource: { entityId: 'none' }
		});
	});

	it('reads a deny as a violation named by its policies, the default deny too, and an error as partial', () => {
		const read = (name: 'allow' | 'deny' | 'deny-by-default' | 'evaluation-error') =>
			readDecision(isAuthorizedResponseSchema.parse(fixtures[name]));
		expect(read('allow')).toMatchObject({ outcome: 'ok', matched: false });
		expect(read('deny')).toMatchObject({
			matched: true,
			findings: [{ vendorLabel: 'policy-stand-in-forbid-irreversible', matched: true }]
		});
		expect(read('deny-by-default').findings).toEqual([
			{ category: 'policy-violation', vendorLabel: 'default-deny', ran: true, matched: true }
		]);
		expect(read('evaluation-error').outcome).toBe('partial');
	});

	it('signs and targets the call, and scrubs the secret from an error', async () => {
		const { fetchImpl, calls } = fetchFrom(fixtures.allow);
		const client = createCedarClient({
			config: CONFIG,
			fetch: fetchImpl,
			credential: () => SECRET,
			now: () => new Date('2026-10-02T10:00:00Z')
		});
		const answer = await client.isAuthorized(isAuthorizedRequest(INPUT, CONFIG));
		expect(answer).toEqual({ body: isAuthorizedResponseSchema.parse(fixtures.allow) });
		expect(calls[0]!.url).toBe('https://verifiedpermissions.eu-west-2.amazonaws.com/');
		expect(calls[0]!.headers['x-amz-target']).toBe('VerifiedPermissions.IsAuthorized');
		expect(calls[0]!.headers['authorization']).toMatch(/^AWS4-HMAC-SHA256 Credential=AKIA/);
		const leaky = fetchFrom({ message: `bad key ${SECRET.split(':')[1]}` }, 403);
		const refused = await createCedarClient({
			config: CONFIG,
			fetch: leaky.fetchImpl,
			credential: () => SECRET
		}).isAuthorized({});
		expect(refused).toMatchObject({ error: { kind: 'no-permission' } });
		expect(JSON.stringify(refused)).not.toContain(SECRET.split(':')[1]);
		const keyless = await createCedarClient({
			config: CONFIG,
			fetch: leaky.fetchImpl,
			credential: () => undefined
		}).isAuthorized({});
		expect(keyless).toMatchObject({ error: { kind: 'bad-token' } });
	});

	it('answers offline at pre-act, refuses a host with no policy input, and is never a browser’s', async () => {
		expect(cedarService.browserCapable).toBe(false);
		const client = cedarService.createOffline({ ...CONFIG, offlineFixture: 'deny' });
		const result = await client.screen(request());
		expect('reading' in result && result.reading.matched).toBe(true);
		const bare = await client.screen(request({ policyInput: undefined }));
		expect('error' in bare && bare.error.kind).toBe('unavailable');
	});
});

const componentContext = (hook: 'pre-act'): GuardrailContext => ({
	hook,
	tick: 1,
	spec: { id: 'probe', name: 'probe', goalCardId: '', schemaVersion: 1 } as never,
	usage: { ticks: 1, inputTokens: 0, outputTokens: 0 },
	worldState: {},
	history: []
});

describeConformance({
	manifest: pack,
	guardrailComponents: {
		[cedarService.id]: {
			config: {
				serviceConfig: CONFIG,
				screening: { offline: true, screenDecision: 'note' }
			},
			verdicts: [{ verdict: 'allow', context: componentContext('pre-act') }]
		}
	},
	guardrailServices: {
		[cedarService.id]: {
			config: CONFIG,
			requests: [request()],
			plantedSecret: SECRET
		}
	}
});
