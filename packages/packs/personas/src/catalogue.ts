import type { CartridgeDefinition } from '@craftabot/core';
import { FIXED_TEMPERATURE, MODELS, OPENAI_PROVIDER_ID } from '@craftabot/pack-openai';

/**
 * **The LLM Multi-Pack's persona cartridges** (`06-…` §8, WP26): "personality
 * cartridges — Storyteller, Explainer, Researcher, Planner, Coder, Creator …
 * teaching that behaviour = model × configuration, not just model."
 *
 * All six bind the OpenAI provider — the three real wire-protocol
 * integrations (Anthropic, Gemini, Ollama) the box art also promises are a
 * separate, much larger slice, deferred and documented rather than faked here
 * (`18-…` §7). Nothing about *these* cartridges needed a second provider: the
 * lesson they teach is that the same three models can behave differently
 * given a different personality and a different job, which the existing
 * provider already lets a builder see.
 *
 * `temperature` is fixed at `FIXED_TEMPERATURE` for every entry, not chosen
 * per persona — `catalogue.ts` in `@craftabot/pack-openai` found live that the
 * GPT-5 family hard-rejects any other value (a 400, not a clamp). A
 * "Storyteller = wild imagination" cartridge cannot use temperature to say
 * so; `personality` (free text, appended to the Brain brick's system prompt)
 * is the lever that actually works, so every persona differs there and in
 * which of the three models it rides.
 */

const PERSONA_PROVIDER_ID = OPENAI_PROVIDER_ID;

export const personaCartridges: CartridgeDefinition[] = [
	{
		id: 'personas/storyteller',
		providerId: PERSONA_PROVIDER_ID,
		model: MODELS.quickThinker,
		displayName: 'Storyteller',
		blurb: 'Turns what it sees into a little story as it goes.',
		stats: { words: 3, reasoning: 2, speed: 3 },
		costHint: 'low',
		defaults: { temperature: FIXED_TEMPERATURE, maxTokens: 900 },
		personality:
			'You love turning what you see into a little story as you go, with vivid describing words.'
	},
	{
		id: 'personas/creator',
		providerId: PERSONA_PROVIDER_ID,
		model: MODELS.quickThinker,
		displayName: 'Creator',
		blurb: 'Full of playful ideas for how to reach the goal.',
		stats: { words: 2, reasoning: 2, speed: 3 },
		costHint: 'low',
		defaults: { temperature: FIXED_TEMPERATURE, maxTokens: 800 },
		personality: 'You love inventing playful ideas and trying imaginative approaches to the goal.'
	},
	{
		id: 'personas/explainer',
		providerId: PERSONA_PROVIDER_ID,
		model: MODELS.quickThinker,
		displayName: 'Explainer',
		blurb: 'Talks through its thinking in simple steps.',
		stats: { words: 2, reasoning: 2, speed: 3 },
		costHint: 'low',
		defaults: { temperature: FIXED_TEMPERATURE, maxTokens: 800 },
		personality:
			'You explain your thinking in simple words a friend could follow, one step at a time.'
	},
	{
		id: 'personas/planner',
		providerId: PERSONA_PROVIDER_ID,
		model: MODELS.deepThinker,
		displayName: 'Planner',
		blurb: 'Lists its steps before taking them, and checks the plan.',
		stats: { words: 3, reasoning: 3, speed: 1 },
		costHint: 'high',
		defaults: { temperature: FIXED_TEMPERATURE, maxTokens: 1500 },
		personality:
			'You like listing your steps before you take them, and checking your plan as you go.'
	},
	{
		id: 'personas/researcher',
		providerId: PERSONA_PROVIDER_ID,
		model: MODELS.deepThinker,
		displayName: 'Researcher',
		blurb: 'Checks the manual and its notebook before deciding.',
		stats: { words: 3, reasoning: 3, speed: 1 },
		costHint: 'high',
		defaults: { temperature: FIXED_TEMPERATURE, maxTokens: 1500 },
		personality:
			'You like checking the manual and your notebook before deciding, and explaining what you found.'
	},
	{
		id: 'personas/coder',
		providerId: PERSONA_PROVIDER_ID,
		model: MODELS.pennyThinker,
		displayName: 'Coder',
		blurb: 'Tries to be precise about exact details — on a tiny budget.',
		stats: { words: 1, reasoning: 1, speed: 3 },
		costHint: 'low',
		/*
		 * Deliberately the one persona on Penny Thinker (`06-…` §4's own
		 * "watch it struggle with hard goals" teaching moment, reused rather
		 * than duplicated): a persona that asks for precision on the cheapest,
		 * least-reasoning model is a real lesson about model choice, not a
		 * cartridge nobody would pick. 600, matching Penny Thinker's own
		 * headroom for the same reason recorded there (C5, `12-…` §2).
		 */
		defaults: { temperature: FIXED_TEMPERATURE, maxTokens: 600 },
		personality:
			"You like being precise and careful about exact details — though you don't always get them right."
	}
];
