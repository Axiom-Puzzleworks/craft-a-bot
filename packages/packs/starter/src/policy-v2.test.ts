import type { PackManifest, PolicyCard } from '@craftabot/core';
import { obedient } from '@craftabot/core/testing';
import { describe, expect, it } from 'vitest';
import { buildSpec, runToCompletion, type RunResult } from './session/harness.js';
import { planFor } from './session/plans.js';

/**
 * **The six v2 leaves, each proven by a scripted run** (WP45,
 * `33-POLICY-V2-PDP.md` §6 stage A DoD): a test pack ships one card per
 * leaf; a bot fitted with it runs a scripted plan on the greeting card and
 * the rule fires exactly where the leaf says.
 */

function card(id: string, rule: PolicyCard['rules'][number]): PolicyCard {
	return { id: `v2/policy/${id}`, title: id, schemaVersion: 1, rules: [rule] };
}

const v2Pack: PackManifest = {
	id: 'v2',
	name: 'Policy v2 proofs',
	version: '0.0.1',
	requiresCore: '>=0.0.1',
	policyCards: [
		card('no-code-said', {
			hook: 'pre-act',
			when: {
				kind: 'and',
				all: [
					{ kind: 'call-name-is', value: 'say' },
					{ kind: 'argument-contains', path: 'text', value: '7734' }
				]
			},
			then: 'block-action',
			reason: 'the cupboard code stays private'
		}),
		card('no-four-digits', {
			hook: 'pre-act',
			when: { kind: 'argument-matches', path: 'text', pattern: '[0-9][0-9][0-9][0-9]' },
			then: 'block-action',
			reason: 'no four-digit numbers out loud'
		}),
		card('quiet-near-the-chest', {
			hook: 'pre-act',
			when: {
				kind: 'and',
				all: [
					{ kind: 'call-name-is', value: 'say' },
					{ kind: 'observation-contains', value: 'chest' }
				]
			},
			then: 'block-action',
			reason: 'not a word while the chest is in sight'
		}),
		card('done-means-done', {
			hook: 'post-act',
			when: { kind: 'world-predicate', predicateId: 'said-hello-near-teddy' },
			then: 'stop-run',
			reason: 'the hello is said; nothing more to do'
		}),
		card('two-strikes', {
			hook: 'pre-act',
			when: {
				kind: 'and',
				all: [
					{ kind: 'call-name-is', value: 'say' },
					{ kind: 'history-count', type: 'action.performed', name: 'say', atLeast: 2 }
				]
			},
			then: 'block-action',
			reason: 'two things said is enough'
		}),
		card('wrong-hook', {
			hook: 'pre-act',
			when: { kind: 'hook-is', hook: 'pre-think' },
			then: 'stop-run',
			reason: 'never — this rule is checked at pre-act'
		}),
		card('right-hook', {
			hook: 'pre-act',
			when: { kind: 'hook-is', hook: 'pre-act' },
			then: 'block-action',
			reason: 'every act, at pre-act'
		})
	]
};

const spec = (policyCards: string[]) =>
	buildSpec({
		goalCardId: 'starter/say-hello',
		safety: { maxTicks: 12, blockedActions: [], approvalMode: false, policyCards }
	});

const trips = (run: RunResult, cardId: string) =>
	run
		.byType('guardrail.tripped')
		.filter(
			(event) =>
				event.type === 'guardrail.tripped' && event.payload.guardrailId.startsWith(`${cardId}#`)
		);

const said = (run: RunResult) =>
	run
		.byType('action.performed')
		.filter((event) => event.type === 'action.performed' && event.payload.name === 'say')
		.map((event) =>
			event.type === 'action.performed'
				? (event.payload.arguments as { text?: string }).text
				: undefined
		);

const leaky = () =>
	obedient([
		{ say: 'Psst.', call: 'say', args: { text: 'The cupboard code is 7734.' } },
		{ say: 'Politely now.', call: 'say', args: { text: 'Hello Teddy!' } }
	]);

describe('policy v2 leaves in a run (WP45)', () => {
	it('argument-contains blocks the say that carries the code, and only that one', async () => {
		const run = await runToCompletion({
			script: leaky(),
			spec: spec(['v2/policy/no-code-said']),
			packs: [v2Pack],
			stepLimit: 4
		});
		expect(trips(run, 'v2/policy/no-code-said')).toHaveLength(1);
		expect(said(run)).toEqual(['Hello Teddy!']);
	});

	it('argument-matches blocks any four-digit number', async () => {
		const run = await runToCompletion({
			script: leaky(),
			spec: spec(['v2/policy/no-four-digits']),
			packs: [v2Pack],
			stepLimit: 4
		});
		expect(trips(run, 'v2/policy/no-four-digits')).toHaveLength(1);
		expect(said(run)).toEqual(['Hello Teddy!']);
	});

	it('observation-contains: the greeting room has a chest in sight, so nothing is said', async () => {
		const run = await runToCompletion({
			script: leaky(),
			spec: spec(['v2/policy/quiet-near-the-chest']),
			packs: [v2Pack],
			stepLimit: 4
		});
		expect(trips(run, 'v2/policy/quiet-near-the-chest')).toHaveLength(2);
		expect(said(run)).toEqual([]);
	});

	it('world-predicate: the card stops the run the moment the world says the hello landed', async () => {
		const run = await runToCompletion({
			script: obedient(planFor('starter/say-hello')),
			spec: spec(['v2/policy/done-means-done']),
			packs: [v2Pack],
			stepLimit: 12
		});
		const [trip] = trips(run, 'v2/policy/done-means-done');
		expect(trip?.type === 'guardrail.tripped' ? trip.payload.hook : undefined).toBe('post-act');
		// The predicate was false at every earlier post-act — one trip, at the end.
		expect(trips(run, 'v2/policy/done-means-done')).toHaveLength(1);
	});

	it('history-count: the third say is blocked', async () => {
		const run = await runToCompletion({
			script: obedient([
				{ say: 'One.', call: 'say', args: { text: 'one' } },
				{ say: 'Two.', call: 'say', args: { text: 'two' } },
				{ say: 'Three.', call: 'say', args: { text: 'three' } }
			]),
			spec: spec(['v2/policy/two-strikes']),
			packs: [v2Pack],
			stepLimit: 5
		});
		expect(said(run)).toEqual(['one', 'two']);
		expect(trips(run, 'v2/policy/two-strikes')).toHaveLength(1);
	});

	it('hook-is: a rule checked at pre-act never sees pre-think, and always sees pre-act', async () => {
		const run = await runToCompletion({
			script: leaky(),
			spec: spec(['v2/policy/wrong-hook', 'v2/policy/right-hook']),
			packs: [v2Pack],
			stepLimit: 4
		});
		expect(trips(run, 'v2/policy/wrong-hook')).toHaveLength(0);
		expect(trips(run, 'v2/policy/right-hook')).toHaveLength(2);
		expect(said(run)).toEqual([]);
	});
});
