import type { AgentSpecV2 } from '@craftabot/core';
import { describe, expect, it } from 'vitest';
import { specOnWorld } from './spec-on-world.js';

const bot = (channels: string[], enabled: string[]): AgentSpecV2 =>
	({
		schemaVersion: 2,
		id: 'bot',
		name: 'Bot',
		goalCardId: 'c',
		bricks: [
			{ id: 's', kind: 'starter/sense', slot: 'sense', configVersion: 1, config: { channels } },
			{ id: 'a', kind: 'starter/actions', slot: 'actions', configVersion: 1, config: { enabled } },
			{ id: 'm', kind: 'starter/memory', slot: 'memory', configVersion: 1, config: { window: 5 } }
		]
	}) as unknown as AgentSpecV2;

const desk = {
	senses: [{ id: 'fs-fraud/queue' }, { id: 'fs-fraud/conversation' }],
	actions: [{ id: 'fs-fraud/say' }, { id: 'fs-fraud/hold' }]
} as never;

describe('specOnWorld (WP112)', () => {
	it('keeps what carries over by bare id, and leaves every other brick alone', () => {
		const moved = specOnWorld(
			bot(['fs-disputes/conversation'], ['fs-disputes/say', 'fs-disputes/reimburse']),
			desk
		);
		const config = (kind: string) => moved.bricks.find((brick) => brick.kind === kind)?.config;
		expect(config('starter/sense')).toEqual({ channels: ['fs-fraud/conversation'] });
		expect(config('starter/actions')).toEqual({ enabled: ['fs-fraud/say'] });
		expect(config('starter/memory')).toEqual({ window: 5 });
	});

	it('gives a bot with nothing in common everything the world offers — never a deaf one', () => {
		const moved = specOnWorld(bot(['starter/playroom/sight'], ['starter/playroom/move']), desk);
		expect(moved.bricks[0]?.config).toEqual({
			channels: ['fs-fraud/queue', 'fs-fraud/conversation']
		});
		expect(moved.bricks[1]?.config).toEqual({ enabled: ['fs-fraud/say', 'fs-fraud/hold'] });
	});
});
