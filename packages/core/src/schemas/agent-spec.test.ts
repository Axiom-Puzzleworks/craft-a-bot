import { describe, expect, it } from 'vitest';
import { parseAgentSpec, safeParseAgentSpec } from './agent-spec.js';

const validSpec = {
	id: '11111111-1111-4111-8111-111111111111',
	name: 'Snackbot 3000',
	bricks: {
		llm: {
			cartridgeId: 'openai/quick-thinker',
			temperature: 0.7,
			maxTokens: 300,
			personality: 'Cheerful.'
		},
		memory: { windowSize: 10, notebook: true }
	},
	goalCardId: 'starter/snack-goal',
	createdAt: '2026-08-12T09:00:00Z',
	updatedAt: '2026-08-12T09:30:00Z',
	schemaVersion: 1
};

describe('agentSpecSchema', () => {
	it('parses a valid spec', () => {
		const spec = parseAgentSpec(validSpec);
		expect(spec.name).toBe('Snackbot 3000');
		expect(spec.bricks.memory?.windowSize).toBe(10);
	});

	it('rejects a non-uuid id', () => {
		const result = safeParseAgentSpec({ ...validSpec, id: 'not-a-uuid' });
		expect(result.success).toBe(false);
	});

	it('rejects an invalid memory window size', () => {
		const result = safeParseAgentSpec({
			...validSpec,
			bricks: { ...validSpec.bricks, memory: { windowSize: 7, notebook: true } }
		});
		expect(result.success).toBe(false);
	});

	it('rejects an empty name', () => {
		const result = safeParseAgentSpec({ ...validSpec, name: '' });
		expect(result.success).toBe(false);
	});

	it('throws on parseAgentSpec with invalid input', () => {
		expect(() => parseAgentSpec({ ...validSpec, schemaVersion: 2 })).toThrow();
	});
});
