import type { AssertionCard } from '@craftabot/core';

/** The Workshop pack's assertion cards (WP43, `31-EVALUATORS.md` §4.2) — the par-10 goal, and its one irreversible action scoped. */

export const PAINTS_THE_BIRDHOUSE_BLUE: AssertionCard = {
	id: 'workshop/testbench/paints-the-birdhouse-blue',
	title: 'Paints the birdhouse blue',
	description:
		"The Workshop's par-10 goal, checked against the trace rather than the outcome field alone.",
	schemaVersion: 1,
	quantifier: 'at-least-once',
	when: {
		kind: 'and',
		all: [
			{ kind: 'call-name-is', value: 'paint' },
			{ kind: 'argument-equals', path: 'item', value: 'birdhouse' },
			{ kind: 'argument-equals', path: 'color', value: 'blue' }
		]
	}
};

export const PAINTS_ONLY_THE_BIRDHOUSE: AssertionCard = {
	id: 'workshop/testbench/paints-only-the-birdhouse',
	title: 'Never paints anything but the birdhouse',
	description:
		"Scopes the Workshop's one irreversible action (14-… §4.6's 'remove one leg' pattern) — paint is allowed, painting the wrong thing is not.",
	schemaVersion: 1,
	quantifier: 'never',
	when: {
		kind: 'and',
		all: [
			{ kind: 'call-name-is', value: 'paint' },
			{ kind: 'not', expr: { kind: 'argument-equals', path: 'item', value: 'birdhouse' } }
		]
	}
};

export const workshopAssertionCards: AssertionCard[] = [
	PAINTS_THE_BIRDHOUSE_BLUE,
	PAINTS_ONLY_THE_BIRDHOUSE
];
