import type {
	CartridgeDefinition,
	ChatRequest,
	LLMProvider,
	PackManifest,
	Reader
} from '@craftabot/core';
import { llmReader } from '@craftabot/governance';

/**
 * **`@craftabot/pack-readers-llm`** (WP120, `104-READERS.md` §10.4): a chat
 * model as a reader — `governance`'s `llmReader` bound to a cartridge, the
 * provider the host's (`RunWorkflowOptions.readerProvider`), so a local vLLM,
 * Ollama, OpenAI or Anthropic model reads through the same contract as Jev
 * and a rule. Optional: installed by `--config`, in no edition.
 *
 * It ships one reader, **`readers-llm/reader/mock`**, over a deterministic
 * keyword stand-in — the option whose key appears in the state, else the
 * last one — with a constrained answer and log-probabilities, so the path
 * runs in CI with no key and no network. It is **not a model**, and says so.
 */
export const READERS_LLM_PACK_ID = 'readers-llm';
export const MOCK_LLM_READER_ID = 'readers-llm/reader/mock';
export const KEYWORD_MODEL = 'keyword-stand-in-1';

/** The option a keyword stand-in picks: the first whose key (hyphens read as spaces) the state contains, else the last. */
export function keywordPick(state: unknown, options: readonly string[]): string {
	const text = (typeof state === 'string' ? state : (JSON.stringify(state) ?? '')).toLowerCase();
	return (
		options.find((option) => text.includes(option.toLowerCase().replaceAll('-', ' '))) ??
		options.at(-1)!
	);
}

/**
 * **The keyword stand-in as a provider**: it reads the reader's user message
 * (`{ state, question, options }`), picks by keyword, and answers constrained
 * to that option with its first token at 0.8 and the next option's at 0.2 —
 * so a gate over it has something to read. Declares both seams.
 */
export function keywordProvider(): LLMProvider {
	return {
		id: 'readers-llm-keyword',
		name: 'Keyword stand-in (not a model)',
		keyRequirement: 'none',
		supports: { choice: true, logprobs: true },
		validateKey: async () => ({ ok: true, message: 'The keyword stand-in needs no battery.' }),
		async chat(request: ChatRequest) {
			const asked = JSON.parse(String(request.messages.at(-1)?.content ?? '{}')) as {
				state?: unknown;
				options?: Record<string, unknown>;
			};
			const options = request.choice ?? Object.keys(asked.options ?? {});
			const picked = keywordPick(asked.state, options);
			const other = options.find((option) => option[0] !== picked[0]);
			return {
				text: picked,
				toolCall: null,
				usage: { inputTokens: 0, outputTokens: 1 },
				raw: { standIn: true },
				finishReason: 'stop',
				...(request.topLogprobs !== undefined
					? {
							logprobs: [
								{ token: picked, logprob: Math.log(0.8) },
								...(other ? [{ token: other, logprob: Math.log(0.2) }] : [])
							]
						}
					: {})
			};
		}
	};
}

export const mockLlmReader: Reader = llmReader({
	id: MOCK_LLM_READER_ID,
	name: 'Keyword stand-in (not a model)',
	description:
		'A deterministic keyword rule behind the LLM reader’s contract — constrained, with log-probabilities — so the path from a chat model to a gate runs with no key and no network. Not a model: its answers measure nothing about one.',
	model: KEYWORD_MODEL,
	provider: keywordProvider()
});

/**
 * An LLM reader for a cartridge (`104-…` §10.4): its model, its provider's
 * egress, the host's provider at ask time. What a host registers for each
 * cartridge it wants to read with.
 */
export function llmReaderForCartridge(
	cartridge: Pick<CartridgeDefinition, 'id' | 'model' | 'displayName'>,
	options: { egress?: Reader['egress']; browserCapable?: boolean } = {}
): Reader {
	return llmReader({
		id: `${READERS_LLM_PACK_ID}/reader/${cartridge.id.replaceAll('/', '-')}`,
		name: `${cartridge.displayName}, as a reader`,
		description: `The ${cartridge.displayName} cartridge answering typed questions through the host’s provider.`,
		model: cartridge.model,
		...(options.egress ? { egress: options.egress } : {}),
		...(options.browserCapable !== undefined ? { browserCapable: options.browserCapable } : {})
	});
}

const readersLlmPack: PackManifest = {
	id: READERS_LLM_PACK_ID,
	name: 'LLM readers (optional)',
	version: '0.1.0',
	requiresCore: '>=1.0.0',
	readers: [mockLlmReader]
};

export default readersLlmPack;
