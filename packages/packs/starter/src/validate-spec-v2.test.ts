import {
	createPackRegistry,
	migrateAgentSpec,
	validateSpec,
	validateSpecV2,
	type AgentSpecV2
} from '@craftabot/core';
import { describe, expect, it } from 'vitest';
import starterPack from './index.js';
import { buildRegistry, buildSpec } from './session/harness.js';

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

	/**
	 * The fourth question, answered by the brick (WP14 slice 3d).
	 *
	 * Core used to run this check itself, off `spec.bricks.safety` — one of the
	 * six special cases only V1's six bricks could ever have had. It is the
	 * Safety Brick's own now, because only the Safety Brick knows that the
	 * strings in `blockedActions` are action ids at all.
	 */
	it('reports a blocklist entry that is not an installed action', () => {
		const built = spec();
		built.bricks.push({
			slot: 'safety',
			kind: 'starter/safety',
			configVersion: 1,
			config: { maxTicks: 30, blockedActions: ['nobody/nothing'], approvalMode: false }
		});

		const problems = validateSpec(built, buildRegistry());
		expect(problems).toContainEqual(
			expect.objectContaining({
				code: 'unknown-blocked-action',
				severity: 'warning',
				slot: 'safety',
				details: { actionId: 'nobody/nothing' }
			})
		);
	});

	it('is content with a blocklist naming an action the world really has', () => {
		const built = spec();
		built.bricks.push({
			slot: 'safety',
			kind: 'starter/safety',
			configVersion: 1,
			config: {
				maxTicks: 30,
				blockedActions: ['starter/playroom/open'],
				approvalMode: false
			}
		});

		expect(validateSpec(built, buildRegistry())).toEqual([]);
	});

	/**
	 * Found live: a genuinely fitted Hands & Wheels / Eyes & Ears brick, built
	 * before `starter/actions`'/`starter/sense`'s own ids were qualified with
	 * their world's prefix, still carries the bare `configVersion: 1` shape
	 * (`enabled: ['move', …]`, `channels: ['sight', …]`) — nothing ever
	 * re-visited an already-saved config, so `registry.getAction`/
	 * `getSenseChannel` never recognised the bare form, and the ribbon
	 * reported a correctly-fitted brick as "not installed". `migrateBrickConfig`
	 * (driven by the v1 → v2 bump on both kinds) is what closes this, and this
	 * is exactly the path `validateSpec` — hence `buildRuntimes` and a real
	 * session — takes to reach it.
	 */
	it('recognises pre-qualification bare action and sense-channel ids from an old save', () => {
		const built = spec();
		built.bricks = built.bricks
			.filter((brick) => brick.slot !== 'mobility' && brick.slot !== 'perception')
			.concat([
				{
					slot: 'mobility',
					kind: 'starter/actions',
					configVersion: 1,
					config: { enabled: ['move', 'pick_up', 'put_down', 'give', 'open', 'say', 'celebrate'] }
				},
				{
					slot: 'perception',
					kind: 'starter/sense',
					configVersion: 1,
					config: { channels: ['sight', 'compass'] }
				}
			]);

		expect(validateSpec(built, buildRegistry())).toEqual([]);
	});

	/** The If/Then brick's own version of the same fourth question (WP30's If/Then sizing, stage B). */
	it('reports a rule whose "then" names a tool or action nothing has installed', () => {
		const built = spec();
		built.bricks.push({
			slot: 'reflexes',
			kind: 'starter/if-then',
			configVersion: 1,
			config: {
				rules: [{ ifSees: 'key', then: { kind: 'action', name: 'nobody/nothing' } }]
			}
		});

		// `validateConfig` — the fourth question — is `validateSpec`'s own hook
		// (`validate-spec.ts`), not `validateSpecV2`'s: the same combination
		// the blocklist test above this one uses, for the same reason.
		const problems = validateSpec(built, buildRegistry());
		expect(problems).toContainEqual(
			expect.objectContaining({
				code: 'unknown-if-then-target',
				severity: 'warning',
				slot: 'reflexes',
				details: { name: 'nobody/nothing', kind: 'action' }
			})
		);
	});

	it('is content with a rule naming a tool or action the bot really has', () => {
		const built = spec();
		built.bricks.push({
			slot: 'reflexes',
			kind: 'starter/if-then',
			configVersion: 1,
			config: {
				rules: [{ ifSees: 'key', then: { kind: 'action', name: 'starter/playroom/pick_up' } }]
			}
		});

		expect(validateSpec(built, buildRegistry())).toEqual([]);
	});

	/** The Librarian brick's own version of the same fourth question (WP32 stage A). */
	it('reports a book its own catalogue does not carry', () => {
		const built = spec();
		// `spec()` already carries a `starter/memory` brick by default — the
		// Librarian is `memory`'s other registered kind (a builder's choice
		// of one, `brick-kinds.test.ts`'s own note on why), so it replaces
		// that entry rather than joining it.
		built.bricks = built.bricks.filter((brick) => brick.slot !== 'memory');
		built.bricks.push({
			slot: 'memory',
			kind: 'starter/librarian',
			configVersion: 1,
			config: { windowSize: 10, notebook: false, books: ['nobody-has-this-book'] }
		});

		const problems = validateSpec(built, buildRegistry());
		expect(problems).toContainEqual(
			expect.objectContaining({
				code: 'unknown-book',
				severity: 'warning',
				slot: 'memory',
				details: { bookId: 'nobody-has-this-book' }
			})
		);
	});

	it('is content with a book the bot really has on its shelf', () => {
		const built = spec();
		built.bricks = built.bricks.filter((brick) => brick.slot !== 'memory');
		built.bricks.push({
			slot: 'memory',
			kind: 'starter/librarian',
			configVersion: 1,
			config: { windowSize: 10, notebook: false, books: ['games'] }
		});

		expect(validateSpec(built, buildRegistry())).toEqual([]);
	});

	/** The Connector brick's own version of the same fourth question (WP32 stage B). */
	it('reports a service its own catalogue does not carry', () => {
		const built = spec();
		built.bricks.push({
			slot: 'equipment',
			kind: 'starter/connector',
			configVersion: 1,
			config: { serviceId: 'nobody-has-this-line', scopes: [] }
		});

		const problems = validateSpec(built, buildRegistry());
		expect(problems).toContainEqual(
			expect.objectContaining({
				code: 'unknown-service',
				severity: 'warning',
				slot: 'equipment',
				details: { serviceId: 'nobody-has-this-line' }
			})
		);
	});

	it('reports a scope naming an operation its connected service does not offer', () => {
		const built = spec();
		built.bricks.push({
			slot: 'equipment',
			kind: 'starter/connector',
			configVersion: 1,
			config: { serviceId: 'weather', scopes: ['nobody-has-this-operation'] }
		});

		const problems = validateSpec(built, buildRegistry());
		expect(problems).toContainEqual(
			expect.objectContaining({
				code: 'unknown-scope',
				severity: 'warning',
				slot: 'equipment',
				details: { scopeId: 'nobody-has-this-operation', serviceId: 'weather' }
			})
		);
	});

	it('is content with a real service and a scope it really offers', () => {
		const built = spec();
		built.bricks.push({
			slot: 'equipment',
			kind: 'starter/connector',
			configVersion: 1,
			config: { serviceId: 'weather', scopes: ['forecast'] }
		});

		expect(validateSpec(built, buildRegistry())).toEqual([]);
	});

	it('is content with a connector that has not chosen a line yet', () => {
		const built = spec();
		built.bricks.push({
			slot: 'equipment',
			kind: 'starter/connector',
			configVersion: 1,
			config: { serviceId: '', scopes: [] }
		});

		expect(validateSpec(built, buildRegistry())).toEqual([]);
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
