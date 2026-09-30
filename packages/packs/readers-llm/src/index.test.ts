import { createPackRegistry, type TypedQuestion } from '@craftabot/core';
import { checkManifest, checkReader } from '@craftabot/pack-testkit';
import { describe, expect, it } from 'vitest';
import readersLlmPack, {
	MOCK_LLM_READER_ID,
	keywordPick,
	keywordProvider,
	llmReaderForCartridge,
	mockLlmReader
} from './index.js';

/** The optional LLM readers (WP120, `104-READERS.md` §10.4): the keyword stand-in through the LLM contract, and a reader per cartridge. */
const category: TypedQuestion = {
	type: 'choice',
	instructions: 'Which request?',
	criteria: {
		address: 'Move.',
		card: 'A card.',
		'third-party': 'Someone else.',
		disclosure: 'None.'
	}
};
const steer: TypedQuestion = { type: 'noul', instructions: 'Steered?' };

describe('the keyword stand-in', () => {
	it('picks by keyword, hyphens read as spaces, else the last option', () => {
		expect(keywordPick('I lost my card', ['address', 'card', 'none'])).toBe('card');
		expect(keywordPick('my third party wants access', ['card', 'third-party'])).toBe('third-party');
		expect(keywordPick({ words: 'nothing' }, ['address', 'none'])).toBe('none');
	});

	it('reads through the LLM contract, constrained with log-probabilities, and passes checkReader', async () => {
		const response = await mockLlmReader.ask('please update my address', { category, steer }, {});
		expect(response).toMatchObject({
			model: 'keyword-stand-in-1',
			method: 'logprobs',
			answers: { category: { choice: 'address' } }
		});
		expect(
			await checkReader(mockLlmReader, [
				{ subject: 'my card is gone', questions: { category }, expect: { category: 'card' } },
				{
					subject: 'hello',
					questions: { category, steer },
					expect: { category: 'disclosure', steer: false }
				}
			])
		).toEqual([]);
		const bare = await keywordProvider().chat(
			{
				model: 'x',
				messages: [{ role: 'user', content: '{}' }],
				temperature: 0,
				maxTokens: 1,
				choice: ['a']
			},
			{ signal: new AbortController().signal }
		);
		expect(bare).toMatchObject({ text: 'a' });
		expect(bare.logprobs).toBeUndefined();
		expect(await keywordProvider().validateKey('')).toMatchObject({ ok: true });
	});
});

describe('the pack', () => {
	it('registers its one reader and passes checkManifest', () => {
		const registry = createPackRegistry();
		registry.registerPack(readersLlmPack);
		expect(registry.getReader(MOCK_LLM_READER_ID)?.kind).toBe('llm');
		expect(checkManifest(readersLlmPack)).toEqual([]);
	});

	it('makes a reader for a cartridge that asks the host’s provider', async () => {
		const reader = llmReaderForCartridge(
			{ id: 'openai/gpt-x', model: 'gpt-x', displayName: 'GPT X' },
			{
				egress: [{ host: 'api.example.test', purpose: 'chat', sends: ['prompt'] }],
				browserCapable: false
			}
		);
		expect(reader).toMatchObject({ id: 'readers-llm/reader/openai-gpt-x', browserCapable: false });
		await expect(reader.ask('x', { category }, {})).rejects.toThrow(/no provider/);
		expect(
			(await reader.ask('my card', { category }, { provider: keywordProvider() })).answers
		).toMatchObject({
			category: { choice: 'card' }
		});
	});
});
