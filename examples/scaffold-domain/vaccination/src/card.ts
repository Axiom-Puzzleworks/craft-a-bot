import type { PolicyCard } from '@craftabot/core';

/** *Review before deciding*: the one card the scaffold ships — a decision is blocked until the figures are on the desk. */
export const REVIEW_BEFORE_DECIDING: PolicyCard = {
	id: 'vaccination/policy/review-before-deciding',
	title: 'Review before deciding',
	description:
		'Blocks a decision on a case whose figures are not yet on the desk (veterinary-practice:record-keeping).',
	schemaVersion: 1,
	rules: [
		{
			hook: 'pre-act',
			when: {
				kind: 'and',
				all: [
					{ kind: 'call-name-is', value: 'decide' },
					{ kind: 'not', expr: { kind: 'world-predicate', predicateId: 'reviewed' } }
				]
			},
			then: 'block-action',
			reason: 'The figures come before the decision.'
		}
	]
};
