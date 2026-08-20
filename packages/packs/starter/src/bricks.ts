import type { BrickDefinition } from '@craftabot/core';

/**
 * The six bricks in the V1 box (02-AGENT-MODEL.md §2). Each carries its toy face
 * and its real face; the bench shows the first and the flip side shows the
 * second (00-PROJECT-OVERVIEW.md §6). The colour ↔ concept mapping is fixed in
 * 04 §2.2 and lives in the UI's tokens, not here — this is content, not styling.
 *
 * These are pure data. They arrive in WP5 rather than WP2 because nothing could
 * render them until the bench existed.
 *
 * A brick that joins *after* the open contract (`14-…` §2) — the Radio brick,
 * WP31 stage F, or `pack-monitor`'s Watchbot before it — skips this file
 * entirely and carries its own `name`/`description`/`realName`/
 * `realExplanation` straight on its `BrickKindDefinition` in `brick-kinds.ts`:
 * `facesOf()` below is a bridge back to presentation data that predates the
 * contract, not a step every brick has to take.
 */
export const starterBricks: BrickDefinition[] = [
	{
		id: 'starter/llm',
		kind: 'llm',
		name: 'Brain Brick',
		description: 'The thinking part. Nothing runs without it.',
		realName: 'LLM (large language model)',
		realExplanation:
			'The chat-completions call at the heart of every tick. It takes the goal, what the bot can sense, and what it remembers, and returns a thought plus at most one thing to do. In real systems this is the model call you pay for and the one you tune with temperature and token limits.'
	},
	{
		id: 'starter/memory',
		kind: 'memory',
		name: 'Scrapbook Brick',
		description: 'Remembers the last few turns, and has a notebook to jot things in.',
		realName: 'Conversation and loop history',
		realExplanation:
			'Which past turns get replayed into the next prompt. Without it every turn starts from nothing, which is why a bot with no memory wanders in circles. In real systems this is context-window management, and the notebook is the simplest possible scratchpad memory.'
	},
	{
		id: 'starter/tools',
		kind: 'tools',
		name: 'Tool Belt Brick',
		description: 'Lets the bot use tools — a calculator, dice, a notebook, the manual.',
		realName: 'Function calling / tool use',
		realExplanation:
			"Tool definitions handed to the model through the provider's native tool-calling API, never stuffed into the prompt text. The model chooses when to call one; the engine runs it and feeds the result back. Tools compute and look things up — they never change the world. That is what actions are for."
	},
	{
		id: 'starter/sense',
		kind: 'sense',
		name: 'Eyes & Ears Brick',
		description: 'Decides what the bot can notice about the room.',
		realName: 'The observation builder',
		realExplanation:
			'What context from the environment enters the prompt each turn. Turning a channel off does not blind the bot metaphorically — the text simply is not there. In real systems this is context engineering, and choosing what to leave out matters as much as what to put in.'
	},
	{
		id: 'starter/actions',
		kind: 'actions',
		name: 'Hands & Wheels Brick',
		description: 'Lets the bot actually do things: move, pick up, give, speak.',
		realName: 'The effector set',
		realExplanation:
			'The world-mutating counterpart of tools. Exposed to the model the same way — as callable functions — but kept separate in the UI and the trace because these are the ones with consequences. In a real deployment this is the boundary you guard most carefully.'
	},
	{
		id: 'starter/safety',
		kind: 'safety',
		name: 'Safety Brick',
		description: 'Sets limits, blocks actions, and can make the bot ask permission first.',
		realName: 'Guardrails',
		realExplanation:
			'Checks that run before the bot thinks and before it acts, and can allow, block, or pause for a human. A tripped guardrail is the system working, not failing. In real systems these are your step budgets, permission scoping, and human-in-the-loop approval — the same three ideas at a much larger scale.'
	}
];
