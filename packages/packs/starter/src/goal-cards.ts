import type { GoalCardDefinition } from '@craftabot/core';
import { goalCardStrings } from './strings.js';
import { PLAYROOM_WORLD_ID } from './world/playroom.js';

/**
 * The seven starter Goal Cards (02-AGENT-MODEL.md §3). Each binds a world
 * layout to a success predicate the world evaluates after every tick, and
 * carries the concepts it exists to teach — the teaching arc in §9 walks these
 * in order.
 *
 * Every card with a machine-checkable goal states its `par`: the length of the
 * scripted-optimal solution proved by the L3 solvability suite (`13-…` §2).
 * Free Play has none — nobody but the player knows when it is finished — and
 * the expert card's par is deliberately past the 30-tick platform floor.
 */
export const starterGoalCards: GoalCardDefinition[] = [
	{
		id: 'starter/say-hello',
		title: goalCardStrings['say-hello'].title,
		goalText: goalCardStrings['say-hello'].goalText,
		worldId: PLAYROOM_WORLD_ID,
		layoutId: 'greeting',
		successCondition: 'said-hello-near-teddy',
		hints: [...goalCardStrings['say-hello'].hints],
		teachesConcepts: ['the-loop', 'actions'],
		par: 4
	},
	{
		id: 'starter/snack',
		title: goalCardStrings.snack.title,
		goalText: goalCardStrings.snack.goalText,
		worldId: PLAYROOM_WORLD_ID,
		layoutId: 'snack-hunt',
		successCondition: 'teddy-has-snack',
		hints: [...goalCardStrings.snack.hints],
		teachesConcepts: ['multi-step-behaviour', 'memory', 'sense'],
		par: 7
	},
	{
		id: 'starter/tidy-the-blocks',
		title: goalCardStrings['tidy-the-blocks'].title,
		goalText: goalCardStrings['tidy-the-blocks'].goalText,
		worldId: PLAYROOM_WORLD_ID,
		layoutId: 'tidy-up',
		successCondition: 'blocks-in-chest',
		teachesConcepts: ['repetition', 'sub-goals'],
		hints: [...goalCardStrings['tidy-the-blocks'].hints],
		par: 10
	},
	{
		id: 'starter/locked-chest',
		title: goalCardStrings['locked-chest'].title,
		goalText: goalCardStrings['locked-chest'].goalText,
		worldId: PLAYROOM_WORLD_ID,
		layoutId: 'locked-chest',
		successCondition: 'chest-open-and-blocks-inside',
		hints: [...goalCardStrings['locked-chest'].hints],
		teachesConcepts: ['tool-use', 'retrieval'],
		par: 13
	},
	{
		id: 'starter/locked-chest-expert',
		title: goalCardStrings['locked-chest-expert'].title,
		goalText: goalCardStrings['locked-chest-expert'].goalText,
		worldId: PLAYROOM_WORLD_ID,
		layoutId: 'locked-chest-expert',
		successCondition: 'chest-open-and-blocks-inside',
		hints: [...goalCardStrings['locked-chest-expert'].hints],
		teachesConcepts: ['tool-use', 'retrieval', 'budgets'],
		// 36, measured by the scripted solution in `solvability.test.ts`.
		// `12-…` §2 estimated ~45 by hand; the plan the suite actually runs is
		// tighter than that, and the measured number is the one on the card.
		par: 36,
		expert: true
	},
	{
		id: 'starter/sums-for-teddy',
		title: goalCardStrings['sums-for-teddy'].title,
		goalText: goalCardStrings['sums-for-teddy'].goalText,
		worldId: PLAYROOM_WORLD_ID,
		layoutId: 'sums',
		successCondition: 'correct-sum-said',
		hints: [...goalCardStrings['sums-for-teddy'].hints],
		teachesConcepts: ['hallucination', 'tool-use'],
		par: 2
	},
	{
		id: 'starter/warning-sign',
		title: goalCardStrings['warning-sign'].title,
		goalText: goalCardStrings['warning-sign'].goalText,
		worldId: PLAYROOM_WORLD_ID,
		layoutId: 'warning-sign',
		successCondition: 'said-hello-near-teddy',
		hints: [...goalCardStrings['warning-sign'].hints],
		teachesConcepts: ['indirect-injection', 'guardrails'],
		// Same room, same distances as Say Hello (`19-…` #12, WP25): the safe
		// solution ignores the sign entirely, so it is the identical plan.
		par: 4
	},
	{
		id: 'starter/keep-the-secret',
		title: goalCardStrings['keep-the-secret'].title,
		goalText: goalCardStrings['keep-the-secret'].goalText,
		worldId: PLAYROOM_WORLD_ID,
		layoutId: 'keep-the-secret',
		successCondition: 'hello-said-secret-kept',
		hints: [...goalCardStrings['keep-the-secret'].hints],
		teachesConcepts: ['lethal-trifecta', 'exfiltration', 'guardrails'],
		par: 4
	},
	{
		id: 'starter/tidy-together',
		title: goalCardStrings['tidy-together'].title,
		goalText: goalCardStrings['tidy-together'].goalText,
		worldId: PLAYROOM_WORLD_ID,
		layoutId: 'tidy-together',
		successCondition: 'blocks-in-chest',
		teachesConcepts: ['repetition', 'sub-goals'],
		hints: [...goalCardStrings['tidy-together'].hints],
		// A lone bot can still win this — see `plans.ts` — but the two blocks
		// sit in opposite corners specifically so a `SessionGroup` (`23-…` §10
		// stage E) can beat this number by splitting the trips. `par` is what
		// the schema means it to be everywhere else: the solo-optimal length.
		par: 26,
		coop: true
	},
	{
		id: 'starter/party-line',
		title: goalCardStrings['party-line'].title,
		goalText: goalCardStrings['party-line'].goalText,
		worldId: PLAYROOM_WORLD_ID,
		layoutId: 'party-line',
		// Reused verbatim from `keep-the-secret` (`19-…` #11): the lethal
		// trifecta's shape does not change with the delivery vector, only its
		// request leg does. `session/party-line.test.ts` is what actually
		// exercises the ASI07 lesson, over a real two-seat `SessionGroup`; the
		// solo plan here — like `warning-sign`'s and `keep-the-secret`'s own —
		// is the safe one, which never touches the spoofed claim at all.
		successCondition: 'hello-said-secret-kept',
		hints: [...goalCardStrings['party-line'].hints],
		teachesConcepts: ['identity-spoofing', 'guardrails'],
		// Same room as Say Hello and Keep the Secret: the safe solve is the
		// identical four-move plan, `IGNORE_THE_SIGN` (`session/plans.ts`).
		par: 4,
		coop: true
	},
	{
		id: 'starter/free-play',
		title: goalCardStrings['free-play'].title,
		goalText: goalCardStrings['free-play'].goalText,
		worldId: PLAYROOM_WORLD_ID,
		layoutId: 'free-play',
		successCondition: 'free-play-manual',
		hints: [...goalCardStrings['free-play'].hints],
		teachesConcepts: ['prompting-a-goal']
	}
];
