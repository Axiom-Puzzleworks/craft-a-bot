import { describe, expect, it } from 'vitest';
import validV1 from '../fixtures/agent-spec.v1.valid.json';
import validV2 from '../fixtures/agent-spec.v2.valid.json';
import invalidV2 from '../fixtures/agent-spec.v2.invalid.json';
import {
	agentSpecV2Schema,
	brickInSlot,
	migrateAgentSpec,
	safeParseAgentSpecV2,
	type AgentSpecV2
} from './agent-spec-v2.js';

/**
 * **`AgentSpec` v2** (`14-…` §2.2, WP14).
 *
 * The format change that turns a bot from a fixed six-key object into a list
 * of fitted bricks. Everything here is about the *envelope* core is
 * responsible for — the socket, the kind, the config's version. What the
 * config itself means is the kind's business, and core deliberately never
 * looks inside it.
 */

const migrated = (): AgentSpecV2 => {
	const result = migrateAgentSpec(validV1);
	if ('kind' in result) throw new Error(result.message);
	return result;
};

describe('the v2 envelope', () => {
	it('parses its valid fixture', () => {
		expect(safeParseAgentSpecV2(validV2).success).toBe(true);
	});

	it('rejects its invalid fixture', () => {
		expect(safeParseAgentSpecV2(invalidV2).success).toBe(false);
	});

	it('refuses a socket that is not on the chassis', () => {
		const spec = structuredClone(validV2) as unknown as AgentSpecV2;
		spec.bricks[0]!.slot = 'antenna' as never;
		expect(agentSpecV2Schema.safeParse(spec).success).toBe(false);
	});

	it('refuses a config with no version, because it could never be migrated', () => {
		const spec = structuredClone(validV2) as unknown as AgentSpecV2;
		spec.bricks[0]!.configVersion = 0;
		expect(agentSpecV2Schema.safeParse(spec).success).toBe(false);
	});

	it('accepts a kind core has never heard of, which is the whole point', () => {
		// Core validates the envelope; the *registry* decides whether the kind
		// is installed, and the *kind* decides whether the config is legal.
		const spec = structuredClone(validV2) as unknown as AgentSpecV2;
		spec.bricks[0] = {
			slot: 'brain',
			kind: 'somebody-elses-pack/planner',
			configVersion: 7,
			config: { maxSteps: 5, replanOn: 'failure' }
		};
		expect(agentSpecV2Schema.safeParse(spec).success).toBe(true);
	});

	it('allows an empty chassis — a bot part-way through being built', () => {
		const spec = structuredClone(validV2) as unknown as AgentSpecV2;
		spec.bricks = [];
		expect(agentSpecV2Schema.safeParse(spec).success).toBe(true);
	});

	it('permits two bricks in one socket, which V1 will not use but the Workshop will', () => {
		// `14-…` §2.3: the array format already allows it; the teaching aid's
		// one-per-slot rule is a rule, not a shape.
		const spec = structuredClone(validV2) as unknown as AgentSpecV2;
		const equipment = spec.bricks.find((brick) => brick.slot === 'equipment');
		if (!equipment) throw new Error('the fixture has lost its equipment brick');
		spec.bricks.push({ ...equipment, kind: 'expansion/connector' });
		expect(agentSpecV2Schema.safeParse(spec).success).toBe(true);
	});
});

describe('migrating a v1 bot', () => {
	it('turns each fitted key into an entry naming its socket and kind', () => {
		const spec = migrated();

		expect(spec.schemaVersion).toBe(2);
		expect(spec.bricks.map((brick) => `${brick.slot}=${brick.kind}`)).toEqual([
			'brain=starter/llm',
			'memory=starter/memory',
			'equipment=starter/tools',
			'perception=starter/sense',
			'mobility=starter/actions',
			'safety=starter/safety'
		]);
	});

	it('carries every config across untouched', () => {
		const spec = migrated();
		const brain = brickInSlot(spec, 'brain');
		expect(brain?.config).toEqual(validV1.bricks.llm);
		expect(brain?.configVersion).toBe(1);
	});

	it('leaves out the bricks that were never fitted', () => {
		const bare = { ...structuredClone(validV1), bricks: { llm: validV1.bricks.llm } };
		const result = migrateAgentSpec(bare);
		expect('kind' in result).toBe(false);
		if ('kind' in result) return;
		expect(result.bricks).toHaveLength(1);
		expect(result.bricks[0]?.slot).toBe('brain');
	});

	it('keeps the goal the user wrote, which v1 stored and never used', () => {
		expect(migrated().customGoalText).toBe(validV1.customGoalText);
	});

	it('gives the bot an identity, without inventing what it cannot know', () => {
		const spec = migrated();
		expect(spec.identity.displayName).toBe(validV1.name);
		// A made-up seed would silently change what an existing bot looks like.
		expect(spec.identity.boxArtSeed).toBe('');
	});

	it('is reproducible — the same v1 spec always migrates to the same bytes', () => {
		// Byte-stability is what makes the fixture a contract rather than a
		// snapshot of whatever the object happened to iterate as today.
		expect(JSON.stringify(migrated())).toBe(JSON.stringify(migrated()));
		expect(migrated()).toEqual(validV2);
	});

	it('passes a v2 spec straight through', () => {
		const result = migrateAgentSpec(validV2);
		expect('kind' in result).toBe(false);
		if ('kind' in result) return;
		expect(result).toEqual(validV2);
	});

	it('refuses a v1 spec that was not valid v1 to begin with', () => {
		const broken = { ...structuredClone(validV1), goalCardId: '' };
		expect(migrateAgentSpec(broken)).toMatchObject({ kind: 'migration-error' });
	});

	it('says so plainly when a bot is from a newer set', () => {
		const result = migrateAgentSpec({ ...validV2, schemaVersion: 99 });
		expect(result).toMatchObject({ kind: 'migration-error', detectedVersion: 99 });
		expect((result as { message: string }).message).toContain('newer');
	});

	it('refuses something that is not a bot at all', () => {
		expect(migrateAgentSpec('a bot, honestly')).toMatchObject({ kind: 'migration-error' });
		expect(migrateAgentSpec(null)).toMatchObject({ kind: 'migration-error' });
		expect(migrateAgentSpec({})).toMatchObject({ kind: 'migration-error' });
	});
});

describe('brickInSlot', () => {
	it('finds the brick fitted to a socket, or nothing', () => {
		const spec = migrated();
		expect(brickInSlot(spec, 'safety')?.kind).toBe('starter/safety');

		const bare = { ...spec, bricks: [] };
		expect(brickInSlot(bare, 'safety')).toBeUndefined();
	});
});
