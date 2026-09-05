import { describe, expect, it } from 'vitest';
import { createPackRegistry } from './pack-registry.js';
import {
	argsDigest,
	canonicalJson,
	replayFromCassette,
	type CassetteFile
} from './schemas/cassette.js';
import { CASSETTE_MISS, serviceLineToolId, serviceLineTools } from './service-line-tools.js';
import type { ServiceLine } from './types/service-line.js';
import type { ToolContext } from './types/tool.js';
import { v1BrickKinds } from './testing/index.js';

/**
 * Service lines (WP58 stage A, `47-SERVICE-LINES.md` §4.1): the registry
 * turns a line's operations into tools under the Connector's ids; a tool
 * answers in the fixed order — failure draw, the world's override,
 * `simulate`, the cassette, a loud miss — and never reaches for a network.
 */
const context = (random = () => 0.99, worldState?: Record<string, unknown>): ToolContext => ({
	tick: 1,
	notebook: { read: () => [], append: () => undefined },
	random,
	...(worldState ? { worldState } : {})
});

const simulated: ServiceLine = {
	id: 'acme/crm',
	name: 'the CRM',
	description: 'Customer records.',
	operations: [
		{
			id: 'read',
			name: 'Read',
			description: 'Read a record.',
			riskTier: 'observe',
			failureChance: 0.5
		},
		{ id: 'update', name: 'Update', description: 'Update a record.', riskTier: 'reversible' }
	],
	simulate: (op, args, ctx) => ({
		ok: true,
		output: `${op}:${JSON.stringify(args)}:${(ctx.worldState as { seen?: string } | undefined)?.seen ?? '-'}`
	})
};

async function cassetteFor(line: string): Promise<CassetteFile> {
	return {
		format: 'craftabot-cassette',
		formatVersion: 1,
		lineId: line,
		recordedAt: '2026-09-05T09:00:00.000Z',
		recordedBy: 'test',
		egress: [{ host: 'api.example.test', purpose: 'a test', sends: ['decision'] }],
		entries: [
			{
				op: 'lookup',
				argsDigest: await argsDigest({ id: 7, q: 'x' }),
				args: { id: 7, q: 'x' },
				result: { ok: true, output: 'seven', data: { id: 7 } },
				latencyMs: 12
			}
		]
	};
}

describe('serviceLineTools', () => {
	it('names each operation the way the Connector always has', () => {
		expect(serviceLineToolId('starter', 'starter/weather', 'forecast')).toBe(
			'starter/connector_weather_forecast'
		);
		expect(serviceLineTools('acme', simulated).map((tool) => tool.id)).toEqual([
			'acme/connector_crm_read',
			'acme/connector_crm_update'
		]);
	});

	it('draws the failure first, then honours the world’s override, then simulates', async () => {
		const [read] = serviceLineTools('acme', simulated);
		expect(
			await read!.execute(
				{},
				context(() => 0.1)
			)
		).toMatchObject({ ok: false, output: expect.stringContaining('busy') });
		expect(
			await read!.execute(
				{},
				context(() => 0.9, { serviceOverrides: { 'acme/connector_crm_read': 'canned' } })
			)
		).toEqual({ ok: true, output: 'canned' });
		expect(
			await read!.execute(
				{},
				context(() => 0.9, { toolOverrides: { 'acme/connector_crm_read': { a: 1 } } })
			)
		).toEqual({ ok: true, output: '{"a":1}' });
		expect(
			await read!.execute(
				{ id: 3 },
				context(() => 0.9, { seen: 'S' })
			)
		).toEqual({
			ok: true,
			output: 'read:{"id":3}:S'
		});
	});

	it('replays a cassette by op and digest, and misses loudly with no network', async () => {
		const recorded: ServiceLine = {
			id: 'acme/bureau',
			name: 'the bureau',
			description: 'Recorded.',
			operations: [{ id: 'lookup', name: 'Lookup', description: 'Look up.', riskTier: 'observe' }],
			cassette: await cassetteFor('acme/bureau')
		};
		const [lookup] = serviceLineTools('acme', recorded);
		const originalFetch = globalThis.fetch;
		globalThis.fetch = (() => {
			throw new Error('a replay must never call out');
		}) as typeof fetch;
		try {
			// Key order does not matter: the digest is over canonical JSON.
			expect(await lookup!.execute({ q: 'x', id: 7 }, context())).toEqual({
				ok: true,
				output: 'seven',
				data: { id: 7 }
			});
			const miss = await lookup!.execute({ id: 8 }, context());
			expect(miss).toMatchObject({ ok: false, errorKind: CASSETTE_MISS });
			expect(miss.output).toContain('nothing was sent');
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	it('a line with neither a simulation nor a cassette answers a miss too', async () => {
		const bare: ServiceLine = {
			id: 'acme/void',
			name: 'the void',
			description: 'Nothing.',
			operations: [{ id: 'ping', name: 'Ping', description: 'Ping.', riskTier: 'observe' }]
		};
		const [ping] = serviceLineTools('acme', bare);
		expect(await ping!.execute({}, context())).toMatchObject({
			ok: false,
			errorKind: CASSETTE_MISS
		});
	});
});

describe('cassettes', () => {
	it('canonical JSON sorts keys at every depth, so a digest is order-free', async () => {
		expect(canonicalJson({ b: 1, a: { d: 2, c: [3, { f: 1, e: 0 }] } })).toBe(
			'{"a":{"c":[3,{"e":0,"f":1}],"d":2},"b":1}'
		);
		expect(await argsDigest({ b: 1, a: 2 })).toBe(await argsDigest({ a: 2, b: 1 }));
		expect(await argsDigest(undefined)).toBe(await argsDigest({}));
	});

	it('replays a clone, twice identically, and undefined for an unknown op', async () => {
		const cassette = await cassetteFor('x');
		const first = await replayFromCassette(cassette, 'lookup', { id: 7, q: 'x' });
		const second = await replayFromCassette(cassette, 'lookup', { id: 7, q: 'x' });
		expect(first).toEqual(second);
		expect(first).not.toBe(second);
		expect(await replayFromCassette(cassette, 'other', { id: 7, q: 'x' })).toBeUndefined();
	});
});

describe('the registry’s service-line lane', () => {
	it('registers the line, synthesises its tools, and refuses a pack that also ships one of them', () => {
		const registry = createPackRegistry();
		registry.registerPack({
			id: 'acme',
			name: 'Acme',
			version: '1.0.0',
			requiresCore: '>=1.0.0',
			brickKinds: v1BrickKinds(),
			serviceLines: [simulated]
		});
		expect(registry.getServiceLine('acme/crm')?.name).toBe('the CRM');
		expect(registry.listServiceLines().map((line) => line.id)).toEqual(['acme/crm']);
		expect(registry.getTool('acme/connector_crm_read')?.riskTier).toBe('observe');
		const clash = createPackRegistry();
		expect(() =>
			clash.registerPack({
				id: 'acme',
				name: 'Acme',
				version: '1.0.0',
				requiresCore: '>=1.0.0',
				brickKinds: v1BrickKinds(),
				tools: serviceLineTools('acme', simulated),
				serviceLines: [simulated]
			})
		).toThrow(/tool/);
	});
});
