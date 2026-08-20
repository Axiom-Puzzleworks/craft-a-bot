import { migrateAgentSpec, type AgentSpecV2 } from '@craftabot/core';
import { obedient, type MockScript } from '@craftabot/core/testing';
import { describe, expect, it } from 'vitest';
import { buildSpec, runToCompletion } from './harness.js';

/**
 * **WP30 stage B** (`18-…` §3, `24-ROBOT-FRIENDS-DESIGN.md`'s own precedent
 * for a post-contract brick's real-session proof): the Planner brick's own
 * plan-then-execute mechanics, over a real session with the real starter
 * tools and the real Playroom — mirroring `radio.test.ts`'s split (on/off
 * switching is covered elsewhere; this file is for what the brick actually
 * *does* once fitted).
 *
 * `starter/planner` has no V1 counterpart, so — same as Radio — a
 * planner-fitted spec is built by migrating to v2 and pushing the brick on
 * directly rather than through `buildSpec`'s own `SpecOverrides`.
 */

type PlannerConfig = { maxSteps?: number; replanOn?: 'failure' | 'never' };

function plannerSpec(config: PlannerConfig = {}): AgentSpecV2 {
	const migrated = migrateAgentSpec(buildSpec());
	if ('kind' in migrated) throw new Error(migrated.message);
	migrated.bricks.push({
		slot: 'planner',
		kind: 'starter/planner',
		config,
		configVersion: 1
	});
	return migrated;
}

const SAY = (text: string) => ({ say: text, call: 'say', args: { text } });
const MAKE_PLAN = (steps: string[]) => ({
	say: 'Planning.',
	call: 'make_plan',
	args: { steps }
});
const CHECK_OFF = (index: number) => ({
	say: 'Checking off.',
	call: 'check_off_step',
	args: { index }
});
/** Bumps straight into the wall from the greeting layout's start square — attempted, `ok: false`, never refused (`contract.test.ts`'s own illegal-action fixture). */
const BUMP_WALL = { say: 'Trying anyway.', call: 'move', args: { direction: 'west' } };

type RunEvents = Awaited<ReturnType<typeof runToCompletion>>['events'];

/**
 * The Nth prompt's system message (0-indexed) — where the Planner's checklist
 * and any one-time notice both land, joined in with every other brick's own
 * section (`composeSystemMessage`, `prompt.ts`). Unlike the Scrapbook's "What
 * you remember", the Planner's section is not a separate `ChatMessage`.
 */
function systemMessageAt(events: RunEvents, index: number) {
	const prompt = events.filter((event) => event.type === 'prompt.composed').at(index);
	if (prompt?.type !== 'prompt.composed') return '';
	return prompt.payload.messages[0]?.content ?? '';
}

describe('the Planner brick, over a real session', () => {
	it('nudges to plan before any plan exists', async () => {
		const run = await runToCompletion({
			script: obedient([SAY('Hello Teddy, I am your new robot!')]),
			spec: plannerSpec(),
			maxTicks: 1
		});

		expect(systemMessageAt(run.events, 0)).toContain('You have not made a plan yet');
		expect(systemMessageAt(run.events, 0)).toContain('up to 5 steps');
	});

	it('shows the checklist, unchecked, on the prompt right after make_plan', async () => {
		const run = await runToCompletion({
			script: obedient([MAKE_PLAN(['Find the key', 'Open the chest']), SAY('Hi')]),
			spec: plannerSpec(),
			maxTicks: 2
		});

		const section = systemMessageAt(run.events, 1);
		expect(section).toContain('[ ] 1. Find the key');
		expect(section).toContain('[ ] 2. Open the chest');
	});

	it('marks a step checked once check_off_step names it, leaving the rest unchecked', async () => {
		const run = await runToCompletion({
			script: obedient([MAKE_PLAN(['Find the key', 'Open the chest']), CHECK_OFF(1), SAY('Hi')]),
			spec: plannerSpec(),
			maxTicks: 3
		});

		const section = systemMessageAt(run.events, 2);
		expect(section).toContain('[x] 1. Find the key');
		expect(section).toContain('[ ] 2. Open the chest');
	});

	it('truncates a plan longer than maxSteps, with a one-time notice', async () => {
		const run = await runToCompletion({
			script: obedient([MAKE_PLAN(['a', 'b', 'c', 'd', 'e', 'f', 'g']), SAY('one'), SAY('two')]),
			spec: plannerSpec({ maxSteps: 5 }),
			maxTicks: 3
		});

		const afterPlan = systemMessageAt(run.events, 1);
		expect(afterPlan).toContain('only the first 5 were kept');
		expect(afterPlan).toContain('[ ] 5. e');
		expect(afterPlan).not.toContain('6. f');

		// The notice is read once and cleared — the tick after, it is gone.
		const laterTick = systemMessageAt(run.events, 2);
		expect(laterTick).not.toContain('only the first 5 were kept');
	});

	it('leaves an invalid check-off index alone, with a notice, and no crash', async () => {
		const run = await runToCompletion({
			script: obedient([MAKE_PLAN(['Only step']), CHECK_OFF(99), SAY('Hi')]),
			spec: plannerSpec(),
			maxTicks: 3
		});

		const section = systemMessageAt(run.events, 2);
		expect(section).toContain('nothing changed');
		expect(section).toContain('[ ] 1. Only step');
	});

	it('replanOn "failure": nudges to replan after an ordinary action fails', async () => {
		const run = await runToCompletion({
			script: obedient([BUMP_WALL, SAY('one')]),
			spec: plannerSpec({ replanOn: 'failure' }),
			maxTicks: 2
		});

		expect(systemMessageAt(run.events, 1)).toContain('did not work');
	});

	it('replanOn "never": stays quiet after the very same failure', async () => {
		const run = await runToCompletion({
			script: obedient([BUMP_WALL, SAY('one')]),
			spec: plannerSpec({ replanOn: 'never' }),
			maxTicks: 2
		});

		expect(systemMessageAt(run.events, 1)).not.toContain('did not work');
	});

	it('does not nudge to replan after make_plan or check_off_step themselves fail validation', async () => {
		// A malformed check_off_step (out-of-range index) is a *handled* outcome,
		// not a call the world refused or an action that failed — no replan nudge.
		const run = await runToCompletion({
			script: obedient([MAKE_PLAN(['Only step']), CHECK_OFF(99), SAY('Hi')]),
			spec: plannerSpec({ replanOn: 'failure' }),
			maxTicks: 3
		});

		expect(systemMessageAt(run.events, 2)).not.toContain('did not work');
	});

	it('a thinking-only tick with no call leaves the checklist untouched', async () => {
		const script: MockScript = [
			{ text: 'Planning.', toolCall: { name: 'make_plan', arguments: { steps: ['Only step'] } } },
			{ text: 'Just thinking for a moment.', toolCall: null },
			{ text: 'Ready now.', toolCall: { name: 'say', arguments: { text: 'Hi' } } }
		];
		const run = await runToCompletion({ script, spec: plannerSpec(), maxTicks: 3 });

		const section = systemMessageAt(run.events, 2);
		expect(section).toContain('[ ] 1. Only step');
	});
});
