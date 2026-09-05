import { argsDigest, type CassetteFile, type ServiceLine } from '@craftabot/core';
import { describe, expect, it } from 'vitest';
import { checkServiceLine } from './service-line.js';

/**
 * `checkServiceLine` (WP58 stage B, `47-…` §4.3), proven against hand-written
 * lines: an operation without a tier, a `live` without egress, a simulation
 * that reads the clock, a cassette that leaks, a line that calls out on a
 * miss — and a sound line of each kind.
 */
const checks = async (line: ServiceLine, fixture = {}) => [
	...new Set((await checkServiceLine(line, { packId: 't', ...fixture })).map((i) => i.check))
];

/** `sound` without its simulation, for the recorded and live variants. */
function unsimulated(): Omit<ServiceLine, 'simulate'> {
	const { simulate: _simulate, ...rest } = sound;
	void _simulate;
	return rest;
}

const sound: ServiceLine = {
	id: 't/sound',
	name: 'Sound',
	description: 'A sound line.',
	operations: [
		{ id: 'read', name: 'Read', description: 'Read.', riskTier: 'observe', failureChance: 0.1 }
	],
	simulate: (op, args, ctx) => ({
		ok: true,
		output: `${op}:${JSON.stringify(args)}:${ctx.random().toFixed(3)}`
	})
};

async function cassette(entries: CassetteFile['entries']): Promise<CassetteFile> {
	return {
		format: 'craftabot-cassette',
		formatVersion: 1,
		lineId: 't/recorded',
		recordedAt: '2026-09-05T09:00:00.000Z',
		recordedBy: 'test',
		egress: [{ host: 'api.example.test', purpose: 'test', sends: ['decision'] }],
		entries
	};
}

describe('checkServiceLine', () => {
	it('passes a sound simulated line, a sound recorded line and a sound live line', async () => {
		expect(await checks(sound)).toEqual([]);
		const recorded: ServiceLine = {
			id: 't/recorded',
			name: 'Recorded',
			description: 'A recording.',
			operations: [{ id: 'lookup', name: 'Lookup', description: 'Look.', riskTier: 'observe' }],
			cassette: await cassette([
				{
					op: 'lookup',
					argsDigest: await argsDigest({ id: 1 }),
					args: { id: 1 },
					result: { ok: true, output: 'one' },
					latencyMs: 3
				}
			])
		};
		expect(await checks(recorded, { plantedSecret: 'xyz-secret' })).toEqual([]);
		const live: ServiceLine = {
			id: 't/live',
			name: 'Live',
			description: 'Live.',
			operations: [{ id: 'ping', name: 'Ping', description: 'Ping.', riskTier: 'observe' }],
			live: {
				egress: [{ host: 'api.example.test', purpose: 'pings', sends: ['decision'] }],
				call: async (_op, _args, deps) => {
					try {
						await deps.fetch('https://api.example.test/ping');
						return { ok: true, output: 'pong' };
					} catch {
						return { ok: false, output: 'no network' };
					}
				}
			}
		};
		expect(await checks(live, { plantedSecret: 'xyz-secret' })).toEqual([]);
	});

	it('rejects an operation without a tier and a failure chance outside 0..1', async () => {
		const tierless = {
			...sound,
			operations: [{ id: 'read', name: 'Read', description: 'Read.', failureChance: 3 }]
		} as unknown as ServiceLine;
		expect(await checks(tierless)).toEqual(['serviceLine.operation-tier']);
	});

	it('rejects a simulation that reads the clock', async () => {
		const clocky: ServiceLine = {
			...sound,
			id: 't/clocky',
			simulate: () => ({ ok: true, output: String(Date.now()) })
		};
		const issues = await checkServiceLine(clocky, { packId: 't' });
		expect(issues.map((i) => i.check)).toEqual(['serviceLine.simulate-pure']);
		expect(issues[0]?.message).toContain('the clock');
	});

	it('rejects a live client with no egress, and one that puts its credential in a result', async () => {
		const mute: ServiceLine = {
			...unsimulated(),
			id: 't/mute',
			live: { egress: [], call: async () => ({ ok: true, output: 'x' }) }
		};
		expect(await checks(mute)).toEqual(['serviceLine.live-declares-egress']);
		const leaky: ServiceLine = {
			...unsimulated(),
			id: 't/leaky',
			live: {
				egress: [{ host: 'api.example.test', purpose: 'p', sends: ['decision'] }],
				call: async (_op, _args, deps) => ({ ok: true, output: `key ${deps.getCredential('k')}` })
			}
		};
		expect(await checks(leaky, { plantedSecret: 'xyz-secret' })).toEqual([
			'serviceLine.no-secret-leaks'
		]);
	});

	it('rejects a cassette that does not replay to itself, and one carrying the planted secret', async () => {
		const broken: ServiceLine = {
			...unsimulated(),
			id: 't/broken',
			cassette: await cassette([
				{
					op: 'read',
					argsDigest: 'not-the-digest',
					args: { id: 1 },
					result: { ok: true, output: 'xyz-secret' },
					latencyMs: 1
				}
			])
		};
		expect(await checks(broken, { plantedSecret: 'xyz-secret' })).toEqual([
			'serviceLine.cassette-replays',
			'serviceLine.no-secret-leaks'
		]);
	});
});
