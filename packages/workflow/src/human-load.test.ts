import type { StageRecord } from '@craftabot/core';
import { describe, expect, it } from 'vitest';
import { touchedCaseOf, touchesOf } from './human-load.js';

/**
 * WP80 (`73-…` §4): a workflow run folded to the human-load metrics' shape —
 * a touch per human stage answered, per escalation, per approval a person
 * gave; a decision per stage the spec names a kind for, at the
 * configuration's level, 1 for the control.
 */
const stage = (
	stageId: string,
	executor: StageRecord['executor'],
	status: StageRecord['status'],
	extra: Partial<StageRecord> = {}
): StageRecord => ({
	stageId,
	executor,
	startedTick: 0,
	endedTick: 0,
	durationMs: 0,
	input: { digest: 'in' },
	output: { digest: 'out', value: { outcome: stageId === 'record' ? 'decline' : undefined } },
	guards: { checked: 0, tripped: [] },
	status,
	...extra
});

const person = { kind: 'person' as const, id: 'p1', name: 'P. Erson' };

describe('touchesOf', () => {
	it('counts a human stage answered, an escalation, and an approval a person gave', () => {
		expect(
			touchesOf(stage('review', { kind: 'human', prompt: '?', options: ['a'] }, 'ok'))
		).toEqual(['human:review']);
		expect(
			touchesOf(stage('review', { kind: 'human', prompt: '?', options: ['a'] }, 'escalated'))
		).toEqual(['human:review', 'escalated:review']);
		expect(
			touchesOf(stage('review', { kind: 'human', prompt: '?', options: ['a'] }, 'error'))
		).toEqual([]);
		expect(
			touchesOf(
				stage('decide', { kind: 'agent', until: 'decided' }, 'ok', {
					approval: { requested: true, by: person, decision: 'yes' }
				})
			)
		).toEqual(['approved-by:decide']);
		expect(touchesOf(stage('decide', { kind: 'rule', rule: 'r' }, 'ok'))).toEqual([]);
	});
});

describe('touchedCaseOf', () => {
	const stages = [
		stage('intake', { kind: 'rule', rule: 'intake' }, 'ok'),
		stage('record', { kind: 'rule', rule: 'record' }, 'ok'),
		stage('four-eyes', { kind: 'human', prompt: '?', options: ['confirm'] }, 'ok')
	];
	const kindOf = (stageId: string, output: unknown) =>
		stageId === 'record' && (output as { outcome?: string }).outcome === 'decline'
			? 'adverse-credit-decision'
			: undefined;

	it('folds the touches and the decisions at the configuration’s level', () => {
		const touched = touchedCaseOf(
			{ id: 'run-1', stages, config: { autonomy: { level: 5 } } },
			kindOf
		);
		expect(touched).toEqual({
			id: 'run-1',
			touches: [{ kind: 'human:four-eyes' }],
			decisions: [{ kind: 'adverse-credit-decision', level: 5 }]
		});
	});

	it('is Level 1 for the control, and carries no decisions without a kind', () => {
		expect(touchedCaseOf({ id: 'run-2', stages, config: {} }, kindOf).decisions).toEqual([
			{ kind: 'adverse-credit-decision', level: 1 }
		]);
		expect(touchedCaseOf({ id: 'run-3', stages, config: {} })).toEqual({
			id: 'run-3',
			touches: [{ kind: 'human:four-eyes' }]
		});
	});
});
