/**
 * Live smoke test against TypeSafe's Jev (`98-JEV.md` §3). **Never runs in CI**;
 * invoked deliberately with `CRAFTABOT_CREDENTIAL_TYPESAFE` in `.env`:
 *
 *     npm run smoke:typesafe
 *
 * One call through the line's own live client: it proves the key, the pinned
 * model and the answer's shape, and times the round trip. It never prints the key.
 */
import { callSystemOne, servicingJevRequest } from '../dist/index.js';

async function main(): Promise<number> {
	const key = process.env['CRAFTABOT_CREDENTIAL_TYPESAFE'];
	if (!key || key.trim() === '') {
		console.log('CRAFTABOT_CREDENTIAL_TYPESAFE is not set — skipping the live smoke test.');
		return 0;
	}
	const request = servicingJevRequest(
		'need',
		"I've been let go and I'm worried about my payments."
	);
	const start = performance.now();
	const result = await callSystemOne(request, {
		fetch: globalThis.fetch,
		getCredential: () => key
	});
	const ms = Math.round(performance.now() - start);
	if (!result.ok) {
		console.error(`✗ ${result.output} (${ms} ms)`);
		return 1;
	}
	const data = result.data as { model: string; usage: { input_tokens: number } };
	console.log(
		`✓ ${data.model} answered in ${ms} ms — ${result.output}; ${data.usage.input_tokens} input tokens`
	);
	return 0;
}

main().then((code) => {
	process.exitCode = code;
});
