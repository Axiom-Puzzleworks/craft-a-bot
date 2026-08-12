import { describe, expect, it } from 'vitest';
import { REPROMPT_INSTRUCTION, decide } from './decide.js';
import type { ChatResponse } from '../types/provider.js';

const available = {
	toolNames: new Set(['calculator']),
	actionNames: new Set(['move', 'say'])
};

function response(overrides: Partial<ChatResponse> = {}): ChatResponse {
	return {
		text: 'Thinking about it.',
		toolCall: null,
		usage: { inputTokens: 10, outputTokens: 5 },
		raw: {},
		finishReason: 'stop',
		...overrides
	};
}

describe('decide', () => {
	it('reads a thought with no call as a legitimate thinking turn', () => {
		expect(decide(response(), available)).toEqual({
			kind: 'thought-only',
			thought: 'Thinking about it.'
		});
	});

	it('routes a known tool name as a tool', () => {
		const decision = decide(
			response({ toolCall: { name: 'calculator', arguments: { expression: '2+2' } } }),
			available
		);
		expect(decision).toMatchObject({ kind: 'call', call: { kind: 'tool', name: 'calculator' } });
	});

	it('routes a known action name as an action', () => {
		const decision = decide(
			response({ toolCall: { name: 'move', arguments: { direction: 'north' } } }),
			available
		);
		expect(decision).toMatchObject({ kind: 'call', call: { kind: 'action', name: 'move' } });
	});

	it('routes an unknown name as an action so the world can narrate the failure', () => {
		const decision = decide(response({ toolCall: { name: 'teleport', arguments: {} } }), available);
		expect(decision).toMatchObject({ kind: 'call', call: { kind: 'action', name: 'teleport' } });
	});

	it('prefers the action when a name is both a tool and an action', () => {
		const decision = decide(response({ toolCall: { name: 'say', arguments: {} } }), {
			toolNames: new Set(['say']),
			actionNames: new Set(['say'])
		});
		expect(decision).toMatchObject({ call: { kind: 'action' } });
	});

	it('trims whitespace from the thought and the call name', () => {
		const decision = decide(
			response({ text: '  Hmm.  ', toolCall: { name: '  move  ', arguments: {} } }),
			available
		);
		expect(decision).toMatchObject({ kind: 'call', thought: 'Hmm.', call: { name: 'move' } });
	});

	it('is malformed only when there is neither a call nor any text', () => {
		expect(decide(response({ text: '   ' }), available)).toEqual({
			kind: 'malformed',
			raw: '   '
		});
	});

	it('treats an empty call name with no text as malformed', () => {
		const decision = decide(
			response({ text: '', toolCall: { name: '  ', arguments: {} } }),
			available
		);
		expect(decision.kind).toBe('malformed');
	});

	it('is not malformed when a call arrives with no thought text', () => {
		const decision = decide(
			response({ text: '', toolCall: { name: 'move', arguments: {} } }),
			available
		);
		expect(decision).toMatchObject({ kind: 'call', thought: '' });
	});

	it('ships a stricter nudge for the single re-prompt', () => {
		expect(REPROMPT_INSTRUCTION).toContain('empty');
	});
});
