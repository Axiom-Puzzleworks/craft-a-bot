import { describe, expect, it } from 'vitest';
import type { EngineEvent, GuardrailContext } from '@craftabot/core';
import {
	MONITOR_RULE_IDS,
	createAllTalkRule,
	createGoingInCirclesRule,
	createRefusalStormRule,
	isMonitorRule,
	rulesFor
} from './rules.js';

/**
 * The watching rules as pure functions of a trace.
 *
 * The property every one of them shares, and the one worth asserting hardest:
 * **they never refuse anything.** A Watchbot that could stop a run would be a
 * Safety Brick with a different hat, and the whole lesson of `14-…` §5.3 is the
 * difference between a control and an observer.
 */

let counter = 0;
function event<T extends EngineEvent['type']>(type: T, payload: unknown): EngineEvent {
	counter += 1;
	return {
		id: `00000000-0000-4000-8000-${String(counter).padStart(12, '0')}`,
		runId: '11111111-1111-4111-8111-111111111111',
		agentId: '22222222-2222-4222-8222-222222222222',
		tick: counter,
		timestamp: '2026-08-13T09:00:00.000Z',
		type,
		payload
	} as EngineEvent;
}

const acted = (name: string) =>
	event('action.performed', { name, arguments: {}, result: { ok: true, description: name } });
const ticked = () => event('tick.started', {});
const tripped = () =>
	event('guardrail.tripped', {
		guardrailId: 'safety/action-blocklist',
		hook: 'pre-act',
		reason: 'not allowed',
		disposition: 'block-action'
	});

function ask(rule: ReturnType<typeof createGoingInCirclesRule>, history: EngineEvent[]) {
	return rule.check({
		hook: 'post-act',
		tick: history.length,
		spec: {
			id: '33333333-3333-4333-8333-333333333333',
			name: 'Testbot',
			schemaVersion: 2,
			bricks: [],
			goalCardId: 'starter/say-hello',
			identity: { displayName: 'Testbot', boxArtSeed: '' },
			createdAt: '2026-08-13T09:00:00Z',
			updatedAt: '2026-08-13T09:00:00Z'
		},
		usage: { ticks: history.length, inputTokens: 0, outputTokens: 0 },
		worldState: {},
		history
	} satisfies GuardrailContext);
}

/** Every rule allows; the only question is whether it had anything to say. */
const noteFrom = (verdict: ReturnType<typeof ask>) => {
	if (!('allow' in verdict) || verdict.allow !== true) {
		throw new Error('a watching rule refused something, which it must never do');
	}
	return verdict.note;
};

describe('going in circles', () => {
	const rule = createGoingInCirclesRule();

	it('says nothing about a bot getting on with it', () => {
		expect(noteFrom(ask(rule, [acted('move'), acted('pick_up'), acted('say')]))).toBeUndefined();
	});

	it('notes the same move three times running', () => {
		const note = noteFrom(ask(rule, [acted('move'), acted('move'), acted('move')]));
		expect(note).toContain('Round in circles');
		expect(note).toContain('move');
	});

	it('waits for three, rather than crying off at two', () => {
		expect(noteFrom(ask(rule, [acted('move'), acted('move')]))).toBeUndefined();
	});

	it('looks at the last three only, so an old circle is not held against it', () => {
		const history = [acted('move'), acted('move'), acted('move'), acted('say'), acted('open')];
		expect(noteFrom(ask(rule, history))).toBeUndefined();
	});
});

describe('all talk, no doing', () => {
	const rule = createAllTalkRule();

	it('says nothing early on, when there is nothing to conclude', () => {
		expect(noteFrom(ask(rule, [ticked(), ticked()]))).toBeUndefined();
	});

	it('notes four turns of thinking with nothing done', () => {
		const note = noteFrom(ask(rule, [ticked(), ticked(), ticked(), ticked()]));
		expect(note).toContain('nothing actually done');
	});

	it('says nothing once the bot has done something', () => {
		const history = [ticked(), ticked(), ticked(), ticked(), acted('move')];
		expect(noteFrom(ask(rule, history))).toBeUndefined();
	});
});

describe('keeps trying what it may not do', () => {
	const rule = createRefusalStormRule();

	it('lets one or two refusals pass without comment', () => {
		expect(noteFrom(ask(rule, [tripped(), tripped()]))).toBeUndefined();
	});

	it('notes a third', () => {
		expect(noteFrom(ask(rule, [tripped(), tripped(), tripped()]))).toContain('refused');
	});
});

describe('the rules as a set', () => {
	/**
	 * The defining property of the brick, asserted against every rule at once and
	 * against the worst run they could be shown. A Watchbot that could refuse
	 * anything would be a Safety Brick wearing a different hat.
	 */
	it('never refuses, whatever it is shown', () => {
		const damning = [
			ticked(),
			ticked(),
			ticked(),
			ticked(),
			acted('move'),
			acted('move'),
			acted('move'),
			tripped(),
			tripped(),
			tripped()
		];
		for (const rule of rulesFor([...MONITOR_RULE_IDS])) {
			expect(ask(rule, damning)).toMatchObject({ allow: true });
		}
	});

	/**
	 * …and each still has something to say about the run it was fitted for. Note
	 * that "all talk" is *silent* on the history above, correctly: a bot that
	 * moved three times is not a bot that did nothing, however badly it moved.
	 */
	it('each has something to say about the run it watches for', () => {
		const circling = [acted('move'), acted('move'), acted('move')];
		const idle = [ticked(), ticked(), ticked(), ticked()];
		const refused = [tripped(), tripped(), tripped()];

		expect(noteFrom(ask(createGoingInCirclesRule(), circling))).toBeDefined();
		expect(noteFrom(ask(createAllTalkRule(), idle))).toBeDefined();
		expect(noteFrom(ask(createRefusalStormRule(), refused))).toBeDefined();
	});

	it('installs only what it was asked for', () => {
		expect(rulesFor(['monitor/all-talk']).map((rule) => rule.id)).toEqual(['monitor/all-talk']);
	});

	it('skips an id it does not know, rather than throwing mid-run', () => {
		expect(rulesFor(['monitor/all-talk', 'monitor/from-the-future'])).toHaveLength(1);
	});

	it('only ever watches at post-act, where the action has already happened', () => {
		for (const rule of rulesFor([...MONITOR_RULE_IDS])) {
			expect(rule.hooks).toEqual(['post-act']);
		}
	});

	it('knows its own rules from anybody else’s', () => {
		expect(isMonitorRule('monitor/all-talk')).toBe(true);
		expect(isMonitorRule('safety/step-budget')).toBe(false);
	});
});
