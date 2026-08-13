import {
	createPackRegistry,
	migrateAgentSpec,
	validateSpecV2,
	type AgentSpecV2
} from '@craftabot/core';
import { describe, expect, it } from 'vitest';
import starterPack from './index.js';
import { buildSpec } from './session/harness.js';

/**
 * **The generic build check** (`14-…` §2.1, WP14).
 *
 * Tested here rather than in core, because the point of the check is that core
 * delegates: it needs registered kinds with real config schemas to delegate
 * *to*, and `pack-starter` is where those live.
 *
 * The v1 validator knows the six bricks by name and asks six bespoke
 * questions. A seventh brick could never join that list, which is D11 showing
 * up in the validator. These are the questions core can ask about any brick at
 * all — including one from a pack it has never seen.
 */

function registry() {
	const built = createPackRegistry();
	built.registerPack(starterPack);
	return built;
}

/** A valid v2 spec, by way of the migration the fixtures already prove. */
function spec(): AgentSpecV2 {
	const migrated = migrateAgentSpec(buildSpec());
	if ('kind' in migrated) throw new Error(migrated.message);
	return migrated;
}

const codes = (problems: ReturnType<typeof validateSpecV2>) =>
	problems.map((problem) => problem.code);

describe('validating a v2 spec against registered kinds', () => {
	it('finds nothing wrong with a well-built bot', () => {
		expect(validateSpecV2(spec(), registry())).toEqual([]);
	});

	it('names a brick that came from a pack this workbench has not got', () => {
		// What a kit file built with an expansion pack looks like on a machine
		// without it. Blocking, because the bot genuinely cannot be assembled.
		const built = spec();
		built.bricks.push({
			slot: 'brain',
			kind: 'planner-pack/planner',
			configVersion: 1,
			config: {}
		});

		const problems = validateSpecV2(built, registry());
		expect(codes(problems)).toContain('unknown-brick-kind');
		expect(problems.find((p) => p.code === 'unknown-brick-kind')?.message).toContain(
			'planner-pack/planner'
		);
	});

	/**
	 * The check the whole contract turns on: core has no idea what a
	 * temperature is, and does not need one. It hands the config to the schema
	 * the kind registered and reports what comes back.
	 */
	it('delegates the config to the kind that defined it', () => {
		const built = spec();
		const brain = built.bricks.find((brick) => brick.slot === 'brain');
		if (!brain) throw new Error('no brain');
		brain.config = { ...brain.config, temperature: 99 };

		const problems = validateSpecV2(built, registry());
		expect(codes(problems)).toContain('bad-brick-config');
		expect(problems[0]?.severity).toBe('blocking');
		const details = problems[0]?.details as { issues: { path: string }[] };
		expect(details.issues.some((issue) => issue.path === 'temperature')).toBe(true);
	});

	it('refuses a brick fitted to the wrong socket', () => {
		const built = spec();
		const brain = built.bricks.find((brick) => brick.slot === 'brain');
		if (!brain) throw new Error('no brain');
		brain.slot = 'mobility';

		expect(codes(validateSpecV2(built, registry()))).toContain('bad-brick-config');
	});

	it('refuses two bricks in one socket, which is V1’s rule and not the format’s', () => {
		const built = spec();
		const brain = built.bricks.find((brick) => brick.slot === 'brain');
		if (!brain) throw new Error('no brain');
		built.bricks.push({ ...brain });

		expect(codes(validateSpecV2(built, registry()))).toContain('slot-already-filled');
	});

	it('warns, but does not block, on a config from a newer version of the same pack', () => {
		// The config parsed, so the brick works — it may simply be missing
		// something the newer version added. Blocking that would be rude.
		const built = spec();
		const brain = built.bricks.find((brick) => brick.slot === 'brain');
		if (!brain) throw new Error('no brain');
		brain.configVersion = 99;

		const problems = validateSpecV2(built, registry());
		expect(problems).toHaveLength(1);
		expect(problems[0]?.severity).toBe('warning');
	});

	it('is content with a chassis that is still empty', () => {
		// Half-built is a normal state; the bench has to be able to hold one.
		expect(validateSpecV2({ ...spec(), bricks: [] }, registry())).toEqual([]);
	});

	it('reports every brick that is wrong, not merely the first', () => {
		const built = spec();
		built.bricks.push({ slot: 'brain', kind: 'nobody/nothing', configVersion: 1, config: {} });
		built.bricks.push({
			slot: 'memory',
			kind: 'nobody/nothing-else',
			configVersion: 1,
			config: {}
		});

		expect(
			codes(validateSpecV2(built, registry())).filter((c) => c === 'unknown-brick-kind')
		).toHaveLength(2);
	});
});
