import { describe, expect, it } from 'vitest';
import {
	brickDefinitionSchema,
	cartridgeDefinitionSchema,
	goalCardDefinitionSchema,
	packManifestMetadataSchema,
	toolMetadataSchema
} from './pack-manifest.js';

describe('pack-manifest schemas', () => {
	it('parses a valid brick definition', () => {
		const result = brickDefinitionSchema.safeParse({
			id: 'core/llm',
			kind: 'llm',
			name: 'LLM Brick',
			description: 'The brain.',
			realName: 'LLM',
			realExplanation: 'The chat-completions call at the heart of every tick.'
		});
		expect(result.success).toBe(true);
	});

	it('rejects an unknown brick kind', () => {
		const result = brickDefinitionSchema.safeParse({
			id: 'core/planner',
			kind: 'planner',
			name: 'Planner Brick',
			description: 'Not in V1.',
			realName: 'Planner',
			realExplanation: 'An Agent Builder concept.'
		});
		expect(result.success).toBe(false);
	});

	it('parses a valid tool definition with requiresNotebook', () => {
		const result = toolMetadataSchema.safeParse({
			id: 'starter/notebook_write',
			name: 'Notebook Write',
			description: 'Write to the scratchpad.',
			parameters: { type: 'object', properties: {} },
			requiresNotebook: true
		});
		expect(result.success).toBe(true);
	});

	it('parses a valid cartridge definition', () => {
		const result = cartridgeDefinitionSchema.safeParse({
			id: 'openai/quick-thinker',
			providerId: 'openai',
			model: 'gpt-5-mini',
			displayName: 'Quick Thinker',
			blurb: 'Fast and cheerful.',
			stats: { words: 2, reasoning: 2, speed: 3 },
			costHint: 'low',
			defaults: { temperature: 0.7, maxTokens: 300 }
		});
		expect(result.success).toBe(true);
	});

	it('rejects a cartridge with an out-of-range stat', () => {
		const result = cartridgeDefinitionSchema.safeParse({
			id: 'openai/quick-thinker',
			providerId: 'openai',
			model: 'gpt-5-mini',
			displayName: 'Quick Thinker',
			blurb: 'Fast and cheerful.',
			stats: { words: 5, reasoning: 2, speed: 3 },
			costHint: 'low',
			defaults: { temperature: 0.7, maxTokens: 300 }
		});
		expect(result.success).toBe(false);
	});

	it('parses a valid goal card definition', () => {
		const result = goalCardDefinitionSchema.safeParse({
			id: 'starter/say-hello',
			title: 'Say Hello!',
			goalText: 'Introduce yourself to Teddy.',
			worldId: 'starter/playroom',
			layoutId: 'default',
			successCondition: 'said-hello-near-teddy',
			hints: [],
			teachesConcepts: ['loop']
		});
		expect(result.success).toBe(true);
	});

	it('parses pack manifest metadata', () => {
		const result = packManifestMetadataSchema.safeParse({
			id: 'starter',
			name: 'My Very First Agent — Starter Parts',
			version: '1.0.0',
			requiresCore: '>=0.0.1'
		});
		expect(result.success).toBe(true);
	});
});

describe('goal card audience (WP53)', () => {
	const card = {
		id: 'x/card',
		title: 'Card',
		goalText: 'Do the thing.',
		worldId: 'x/world',
		layoutId: 'a',
		successCondition: 'done',
		hints: [],
		teachesConcepts: []
	};

	it('is optional, and only kit or workshop', () => {
		expect(goalCardDefinitionSchema.safeParse(card).success).toBe(true);
		expect(goalCardDefinitionSchema.safeParse({ ...card, audience: 'workshop' }).success).toBe(
			true
		);
		expect(goalCardDefinitionSchema.safeParse({ ...card, audience: 'adults' }).success).toBe(false);
	});
});
