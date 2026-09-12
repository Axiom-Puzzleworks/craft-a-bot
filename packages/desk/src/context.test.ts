import { contextSpecFor, type ContextSpec, type DeskRecord } from '@craftabot/core';
import { checkDesk } from '@craftabot/pack-testkit';
import { describe, expect, it } from 'vitest';
import { createDeskWorld, type DeskState, type DeskWorldSpec } from './desk-world.js';
import { TEST_DESK_ID, testDesk, testDeskSpec, type TestExtra } from './test-desk.js';

/**
 * **The context ladder in the runtime** (WP81, `70-CONTEXT-AND-ONTOLOGY.md`
 * §4): the rungs compose the case at `create`; a desk with no hook adds
 * nothing; `include` pulls from hidden; a special-category record never
 * enters by context; the budget truncates with a note; the sense delivery
 * puts the context in the observation whatever senses are on; a malformed
 * context is refused at `create`; `checkDesk` proves the superset property.
 */
const state = (context?: ContextSpec | Record<string, unknown>, world = testDesk) =>
	world.create('one-visitor', context ? { config: { context } } : {}).snapshot() as DeskState;
const ids = (context?: ContextSpec | Record<string, unknown>, world = testDesk) =>
	state(context, world).records.map((record) => record.id);

const SENSITIVE: DeskRecord = {
	id: 'health',
	kind: 'health',
	title: 'Health note',
	classification: 'special-category',
	fields: { text: 'A condition.' }
};
const RELATED: DeskRecord = {
	id: 'ledger',
	kind: 'ledger',
	title: 'Ledger',
	classification: 'personal',
	fields: { text: Array.from({ length: 40 }, (_, i) => `line ${i + 1}`).join('\n') }
};

/** The test desk with a context hook and a desk brief — what a bank desk looks like to the runtime. */
const hookedSpec: DeskWorldSpec<TestExtra> = {
	...testDeskSpec,
	id: 'test/hooked-desk',
	layouts: [
		{
			id: 'one-visitor',
			name: 'One visitor',
			case: (random, config) => {
				const base = testDeskSpec.layouts[0]!.case(random, config);
				return {
					...base,
					revealed: [
						...base.revealed,
						{
							id: 'desk-brief',
							kind: 'notice',
							title: 'Desk brief',
							classification: 'public',
							fields: { text: 'Sign everyone in.' }
						}
					]
				};
			}
		}
	],
	context: (level) =>
		level === 'relational' ? [RELATED, SENSITIVE] : level === 'ontology' ? [RELATED] : []
};
const hooked = createDeskWorld(hookedSpec);

describe('the context ladder', () => {
	it('minimal keeps the work item; case-file is as today; a desk with no hook adds nothing above it', () => {
		expect(ids()).toEqual(['notice']);
		// The test desk's queue names the hidden visitor, not the notice: minimal keeps what the queue names.
		expect(ids(contextSpecFor('minimal'))).toEqual([]);
		expect(ids(contextSpecFor('case-file'))).toEqual(['notice']);
		expect(ids(contextSpecFor('relational'))).toEqual(['notice']);
		expect(ids(contextSpecFor('ontology'))).toEqual(['notice']);
		expect(ids(contextSpecFor('ontology'), hooked)).toEqual(['notice', 'desk-brief', 'ledger']);
		expect(state(contextSpecFor('case-file')).contextRecordIds).toEqual([]);
		expect(state().contextRecordIds).toBeUndefined();
	});

	it('the hook’s records land, the special-category one never, and include pulls from hidden', () => {
		expect(ids(contextSpecFor('relational'), hooked)).toEqual(['notice', 'desk-brief', 'ledger']);
		expect(state(contextSpecFor('relational'), hooked).contextRecordIds).toEqual(['ledger']);
		expect(ids({ ...contextSpecFor('case-file'), include: ['visitor'] }, hooked)).toEqual([
			'notice',
			'desk-brief',
			'visitor'
		]);
		expect(ids({ ...contextSpecFor('relational'), exclude: ['ledger'] }, hooked)).toEqual([
			'notice',
			'desk-brief'
		]);
		expect(ids({ ...contextSpecFor('minimal'), include: ['visitor'] }, hooked)).toEqual([
			'visitor'
		]);
	});

	it('the budget truncates a handed-over record at a line boundary with the note', () => {
		const budgeted = state({ ...contextSpecFor('relational'), budgetTokens: 10 }, hooked);
		const ledger = budgeted.records.find((record) => record.id === 'ledger');
		const text = String(ledger?.fields['text']);
		expect(text.endsWith('… [truncated to 10 tokens]')).toBe(true);
		expect(text.length).toBeLessThan(80);
		expect(text).toBe(
			String(
				state({ ...contextSpecFor('relational'), budgetTokens: 10 }, hooked).records.find(
					(r) => r.id === 'ledger'
				)?.fields['text']
			)
		);
	});

	it('the sense delivery puts the context in the observation; the brief delivery appends it to the desk brief', () => {
		const sensed = hooked.create('one-visitor', {
			config: { context: contextSpecFor('relational') }
		});
		const observation = sensed.observe(['conversation']);
		expect(observation.text).toContain('Handed over as context:');
		expect(observation.text).toContain('Ledger');
		expect(observation.text).not.toContain('Health note');
		const briefed = hooked.create('one-visitor', {
			config: { context: { ...contextSpecFor('relational'), delivery: ['brief', 'line'] } }
		});
		expect(briefed.observe(['conversation']).text).not.toContain('Handed over as context:');
		const brief = (briefed.snapshot() as DeskState).records.find(
			(record) => record.id === 'desk-brief'
		);
		expect(String(brief?.fields['text'])).toContain('Handed over as context:');
		expect(String(brief?.fields['text'])).toContain('The graph line answers');
		// No context configured: the observation is exactly what it was.
		expect(hooked.create('one-visitor').observe(['conversation']).text).not.toContain(
			'Handed over'
		);
	});

	it('a malformed context is refused at create; a reset keeps the rung', () => {
		expect(() =>
			testDesk.create('one-visitor', { config: { context: { level: 'sideways' } } })
		).toThrow(/context:/);
		const world = hooked.create('one-visitor', {
			config: { context: contextSpecFor('relational') }
		});
		world.reset();
		expect((world.snapshot() as DeskState).records.map((record) => record.id)).toEqual([
			'notice',
			'desk-brief',
			'ledger'
		]);
	});

	it('checkDesk proves the superset property and the classification on every rung', () => {
		const ladder = (issues: ReturnType<typeof checkDesk>) =>
			issues.filter((issue) => issue.check.startsWith('desk.context'));
		expect(ladder(checkDesk(testDesk, { purpose: 'testing' }))).toEqual([]);
		expect(ladder(checkDesk(hooked, { purpose: 'testing' }))).toEqual([]);
		// A desk whose hook hands a special-category record over is refused by the runtime, so the check stays green.
		const leaky = createDeskWorld({
			...hookedSpec,
			id: 'test/leaky-desk',
			context: () => [SENSITIVE]
		});
		expect(ladder(checkDesk(leaky, { purpose: 'testing' }))).toEqual([]);
		// A desk that loses a record at a rung is caught.
		const lossy = createDeskWorld({
			...hookedSpec,
			id: 'test/lossy-desk',
			layouts: [
				{
					id: 'one-visitor',
					name: 'One visitor',
					case: (random, config) => {
						const base = hookedSpec.layouts[0]!.case(random, config);
						const context = config?.['context'] as ContextSpec | undefined;
						return context?.level === 'ontology' ? { ...base, revealed: [] } : base;
					}
				}
			]
		});
		expect(checkDesk(lossy, { purpose: 'testing' }).map((issue) => issue.check)).toContain(
			'desk.context-superset'
		);
		expect(TEST_DESK_ID).toBe('test/desk');
	});
});
