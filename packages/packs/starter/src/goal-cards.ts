import type { GoalCardDefinition } from '@craftabot/core';
import { goalCardStrings } from './strings.js';
import { PLAYROOM_WORLD_ID } from './world/playroom.js';

/**
 * The six starter Goal Cards (02-AGENT-MODEL.md §3). Each binds a world layout
 * to a success predicate the world evaluates after every tick, and carries the
 * concepts it exists to teach — the teaching arc in §9 walks these in order.
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
		teachesConcepts: ['the-loop', 'actions']
	},
	{
		id: 'starter/snack',
		title: goalCardStrings.snack.title,
		goalText: goalCardStrings.snack.goalText,
		worldId: PLAYROOM_WORLD_ID,
		layoutId: 'snack-hunt',
		successCondition: 'teddy-has-snack',
		hints: [...goalCardStrings.snack.hints],
		teachesConcepts: ['multi-step-behaviour', 'memory', 'sense']
	},
	{
		id: 'starter/tidy-the-blocks',
		title: goalCardStrings['tidy-the-blocks'].title,
		goalText: goalCardStrings['tidy-the-blocks'].goalText,
		worldId: PLAYROOM_WORLD_ID,
		layoutId: 'tidy-up',
		successCondition: 'blocks-in-chest',
		teachesConcepts: ['repetition', 'sub-goals'],
		hints: [...goalCardStrings['tidy-the-blocks'].hints]
	},
	{
		id: 'starter/locked-chest',
		title: goalCardStrings['locked-chest'].title,
		goalText: goalCardStrings['locked-chest'].goalText,
		worldId: PLAYROOM_WORLD_ID,
		layoutId: 'locked-chest',
		successCondition: 'chest-open-and-blocks-inside',
		hints: [...goalCardStrings['locked-chest'].hints],
		teachesConcepts: ['tool-use', 'retrieval']
	},
	{
		id: 'starter/sums-for-teddy',
		title: goalCardStrings['sums-for-teddy'].title,
		goalText: goalCardStrings['sums-for-teddy'].goalText,
		worldId: PLAYROOM_WORLD_ID,
		layoutId: 'sums',
		successCondition: 'correct-sum-said',
		hints: [...goalCardStrings['sums-for-teddy'].hints],
		teachesConcepts: ['hallucination', 'tool-use']
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
