import {
	roundAnswer,
	type ChatResponse,
	type EgressDeclaration,
	type LLMProvider,
	type Reader,
	type ReaderMethod,
	type ReaderResponse,
	type TypedAnswer,
	type TypedQuestion
} from '@craftabot/core';

/** An LLM reader's definition: who it is, the model it asks for, and — if it carries its own — the provider. */
export interface LlmReaderOptions {
	/** Qualified like every pack contribution: `readers-llm/reader/mock`. */
	id: string;
	name: string;
	description: string;
	/** The provider-native model id, as a cartridge names it. */
	model: string;
	/** The provider, when the reader carries its own; otherwise the host's `ctx.provider`. */
	provider?: LLMProvider;
	systemPrompt?: string;
	egress?: EgressDeclaration[];
	credential?: Reader['credential'];
	browserCapable?: boolean;
}

export const LLM_READER_SYSTEM_PROMPT =
	'You are a careful classifier. You are given a state (the material to judge) and one question with its options. Judge the state against the question and answer with exactly one option key.';
/** The first token's alternatives asked for when the provider returns them. */
export const LLM_READER_TOP_LOGPROBS = 20;

/** The options a question offers, keyed as the model must answer: a choice's criteria, `yes`/`no`, or the level indices. */
export function optionsFor(question: TypedQuestion): Record<string, unknown> {
	switch (question.type) {
		case 'choice':
			return question.criteria;
		case 'noul':
			return { yes: question.criteria?.true ?? 'Yes.', no: question.criteria?.false ?? 'No.' };
		case 'score':
			return Object.fromEntries(question.criteria.map((level, index) => [String(index), level]));
	}
}

/**
 * **The first token's mass folded onto the options** (WP120, `104-…` §10.3;
 * the DGX classifier's method, `99-DGX-SPARK.md` §6): each alternative's
 * probability goes to the options it is a prefix of, split evenly between
 * them, and the total is normalised over the options — uniform when none
 * matched. `covered` is the mass that landed on some option; `ambiguous`
 * the part that began more than one.
 */
export function foldFirstToken(
	options: readonly string[],
	top: ReadonlyArray<{ token: string; logprob: number }>
): { probabilities: Record<string, number>; covered: number; ambiguous: number } {
	const mass = Object.fromEntries(options.map((option) => [option, 0])) as Record<string, number>;
	let covered = 0;
	let ambiguous = 0;
	for (const { token, logprob } of top) {
		if (token === '') continue;
		const p = Math.exp(logprob);
		const matches = options.filter((option) => option.startsWith(token));
		if (matches.length === 0) continue;
		covered += p;
		if (matches.length > 1) ambiguous += p;
		for (const option of matches) mass[option] = mass[option]! + p / matches.length;
	}
	const total = Object.values(mass).reduce((sum, p) => sum + p, 0);
	const probabilities = Object.fromEntries(
		options.map((option) => [option, total > 0 ? mass[option]! / total : 1 / options.length])
	);
	return { probabilities, covered, ambiguous };
}

/** The option a free-text answer names: exactly, else the one key its text contains; `undefined` for none or several. */
export function optionNamed(text: string, keys: readonly string[]): string | undefined {
	const said = text.trim().replace(/^["'`]+|["'`.]+$/g, '');
	if (keys.includes(said)) return said;
	const lower = said.toLowerCase();
	const found = keys.filter((key) => new RegExp(`\\b${escape(key.toLowerCase())}\\b`).test(lower));
	return found.length === 1 ? found[0] : undefined;
}
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const STRENGTH: Record<'logprobs' | 'constrained' | 'argmax', number> = {
	logprobs: 2,
	constrained: 1,
	argmax: 0
};

/**
 * **A chat model as a reader** (WP120, `104-READERS.md` §10.3): one
 * completion per question at temperature 0, the state and the question and
 * its options as the user message. What the answer carries depends on what
 * the provider says it supports:
 *
 * - `choice` and `logprobs` — constrained to the option keys, the first
 *   token's top alternatives folded onto them (`foldFirstToken`): a
 *   distribution and its confidence, `method: 'logprobs'`;
 * - `choice` only — constrained, all the mass on what it said, `confidence:
 *   null`: `method: 'constrained'`;
 * - neither — free text read for the option it names, one-hot, `confidence:
 *   null`: `method: 'argmax'`; text naming no option, or several, is an error.
 *
 * A noul is P(`yes`); a score the level with the most mass. The response's
 * method is the weakest any answer used.
 */
export function llmReader(options: LlmReaderOptions): Reader {
	return {
		id: options.id,
		name: options.name,
		description: options.description,
		kind: 'llm',
		egress: options.egress ?? options.provider?.egress ?? [],
		...(options.credential ? { credential: options.credential } : {}),
		browserCapable: options.browserCapable ?? true,
		answers: ['choice', 'noul', 'score'],
		async ask(subject, questions, ctx): Promise<ReaderResponse> {
			const provider = options.provider ?? ctx.provider;
			if (!provider) throw new Error(`${options.id} has no provider to ask`);
			const constrain = provider.supports?.choice === true;
			const logprobs = constrain && provider.supports?.logprobs === true;
			const answers: Record<string, TypedAnswer> = {};
			let method: 'logprobs' | 'constrained' | 'argmax' = 'logprobs';
			for (const [id, question] of Object.entries(questions)) {
				const offered = optionsFor(question);
				const keys = Object.keys(offered);
				const response = await provider.chat(
					{
						model: options.model,
						temperature: 0,
						maxTokens: 16,
						messages: [
							{ role: 'system', content: options.systemPrompt ?? LLM_READER_SYSTEM_PROMPT },
							{
								role: 'user',
								content: JSON.stringify({
									state: subject,
									question: question.instructions,
									options: offered
								})
							}
						],
						...(constrain ? { choice: keys } : {}),
						...(logprobs ? { topLogprobs: LLM_READER_TOP_LOGPROBS } : {})
					},
					{ signal: ctx.signal ?? new AbortController().signal }
				);
				const { probabilities, used } = distribution(id, keys, response, constrain, logprobs);
				if (STRENGTH[used] < STRENGTH[method]) method = used;
				// Six places, as the contract records every probability (`104-…` §3.2).
				answers[id] = roundAnswer(answerFor(question, keys, probabilities, used));
			}
			return { model: options.model, method: method as ReaderMethod, answers };
		}
	};
}

function distribution(
	id: string,
	keys: readonly string[],
	response: ChatResponse,
	constrained: boolean,
	logprobs: boolean
): { probabilities: Record<string, number>; used: 'logprobs' | 'constrained' | 'argmax' } {
	if (logprobs && response.logprobs && response.logprobs.length > 0)
		return {
			probabilities: foldFirstToken(keys, response.logprobs).probabilities,
			used: 'logprobs'
		};
	const picked =
		constrained && keys.includes(response.text.trim())
			? response.text.trim()
			: optionNamed(response.text, keys);
	if (picked === undefined)
		throw new Error(`the model's answer to "${id}" names none of its options, or more than one`);
	return {
		probabilities: Object.fromEntries(keys.map((key) => [key, key === picked ? 1 : 0])),
		used: constrained ? 'constrained' : 'argmax'
	};
}

function answerFor(
	question: TypedQuestion,
	keys: readonly string[],
	probabilities: Record<string, number>,
	used: 'logprobs' | 'constrained' | 'argmax'
): TypedAnswer {
	const values = keys.map((key) => probabilities[key]!);
	const confidence = used === 'logprobs' ? choiceConfidence(values) : null;
	const top = keys.reduce(
		(best, key) => (probabilities[key]! > probabilities[best]! ? key : best),
		keys[0]!
	);
	switch (question.type) {
		case 'noul':
			return { type: 'noul', noul: probabilities['yes'] ?? 0 };
		case 'score':
			return { type: 'score', score: Number(top), probabilities: values, confidence };
		case 'choice':
			return { type: 'choice', choice: top, probabilities, confidence };
	}
}

/** `(n·p_max − 1)/(n − 1)`, clamped — the one formula (`104-…` §3.2); the runtime rounds it. */
function choiceConfidence(values: readonly number[]): number {
	const n = values.length;
	if (n < 2) return 1;
	return Math.max(0, Math.min(1, (n * Math.max(...values) - 1) / (n - 1)));
}
