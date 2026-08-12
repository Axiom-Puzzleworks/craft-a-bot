/**
 * Live smoke test against the real OpenAI API.
 *
 * **Never runs in CI** (10-CODING-STANDARDS.md §5: "the live OpenAI smoke test
 * runs only via explicit script with an env key"). It is not part of
 * `npm run test`; you invoke it deliberately:
 *
 *     npm run smoke:openai        # reads OPENAI_API_KEY from .env at the root
 *
 * Everything else about the pack is proven offline against canned fixtures. The
 * one thing only a live call can tell you is whether the wire format and the
 * model ids in `catalogue.ts` are still right — which is exactly what this
 * checks, and why it exists at all. It earned its keep on the first run: the
 * canned 401 fixture had been written without the key in the message, so the
 * pack leaked the key into error text until a real call proved otherwise.
 *
 * It prints no part of the key, and it costs a few tokens.
 *
 * Exit status is set via `process.exitCode` rather than `process.exit()`. On
 * Windows, calling `process.exit()` while undici still has a socket handle in
 * teardown trips a libuv assertion (`!(handle->flags & UV_HANDLE_CLOSING)`) and
 * the script dies with a native crash instead of the tidy failure it just
 * printed. Setting the code and letting Node drain avoids that entirely.
 */
// Imported from `dist`, not `src`: the smoke test should exercise the artefact
// that actually ships. `npm run smoke` builds first.
import { OpenAiError, createOpenAIProvider, openAiCartridges } from '../dist/index.js';

async function main(): Promise<number> {
	const key = process.env['OPENAI_API_KEY'];

	if (!key || key.trim() === '') {
		console.log('OPENAI_API_KEY is not set — skipping the live smoke test.');
		console.log('Put it in .env at the repo root (gitignored), then re-run.');
		return 0;
	}

	const cartridge = openAiCartridges[0];
	if (!cartridge) throw new Error('the catalogue is empty');

	const provider = createOpenAIProvider({ apiKey: key });

	console.log(`Checking the battery (${provider.name})…`);
	const check = await provider.validateKey(key);
	console.log(check.ok ? `  ✓ ${check.message}` : `  ✗ ${check.message}`);
	if (!check.ok) return 1;

	console.log(`\nStreaming one completion from ${cartridge.displayName} (${cartridge.model})…`);
	const controller = new AbortController();
	const tokens: string[] = [];

	try {
		const response = await provider.chat(
			{
				model: cartridge.model,
				// Deliberately shaped like the prompt the engine really sends
				// (`composePrompt`, 02 §8), including the "think out loud" rule. A
				// smoke test on a toy prompt tells you very little: an earlier
				// version here asked the model to say hello, got a bare tool call
				// back, and looked like a streaming bug when it was nothing of the
				// sort. This shape reliably produces both a thought and an action.
				messages: [
					{
						role: 'system',
						content: [
							'You are a small robot in a simulated playroom. You take one turn at a time.',
							'',
							'Your goal: Find the red ball and bring it to the toy box.',
							'',
							'How to reply:',
							'- Think briefly — a sentence or two, out loud.',
							'- Then call at most one tool or action. Never more than one per turn.'
						].join('\n')
					},
					{
						role: 'user',
						content: 'Right now:\nYou look around: a rug, and a red ball to the north.'
					}
				],
				tools: [
					{
						name: 'move',
						description: 'Roll one square.',
						parameters: {
							type: 'object',
							properties: { direction: { type: 'string', description: 'Which way to roll.' } },
							required: ['direction']
						}
					}
				],
				// The cartridge's own defaults, not invented ones: a smoke test that
				// passes with settings nobody ships is worth very little.
				temperature: cartridge.defaults.temperature,
				maxTokens: cartridge.defaults.maxTokens
			},
			{
				signal: controller.signal,
				onToken: (token: string) => {
					tokens.push(token);
					process.stdout.write(token);
				}
			}
		);

		console.log('\n');
		console.log(`  streamed tokens : ${tokens.length}`);
		console.log(`  text            : ${JSON.stringify(response.text)}`);
		console.log(`  tool call       : ${JSON.stringify(response.toolCall)}`);
		console.log(`  usage           : ${JSON.stringify(response.usage)}`);
		console.log(`  finish reason   : ${response.finishReason}`);

		// The things only a live call can actually prove.
		//
		// Note what is *not* asserted: streamed text. A model may answer with a
		// tool call and no words at all, which is a legitimate decision rather
		// than a parsing failure — an earlier version of this check called that a
		// bug and was simply wrong. What must hold is that the call produced a
		// decision of *some* kind and that we could read it.
		if (response.text === '' && !response.toolCall) {
			throw new Error('neither text nor a tool call — SSE parsing may be wrong');
		}
		if (response.usage.inputTokens === 0) {
			throw new Error('no usage reported — stream_options may have changed');
		}
		if (tokens.length === 0) {
			console.log('\n  note: the model went straight to a tool call, so the bubble stays empty.');
		}

		// Hard rule 2, checked against a live payload rather than a fixture.
		if (JSON.stringify(response).includes(key)) {
			throw new Error('THE KEY APPEARS IN THE RESPONSE — scrubbing is broken');
		}

		console.log('\n✓ Live smoke test passed. Wire format and model id both look right.');
		return 0;
	} catch (error) {
		if (error instanceof OpenAiError) {
			console.error(`\n✗ ${error.kind}: ${error.message}`);
		} else {
			console.error('\n✗', error);
		}
		return 1;
	}
}

process.exitCode = await main();
