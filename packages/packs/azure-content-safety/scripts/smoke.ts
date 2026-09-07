/**
 * Live smoke test against a real Azure AI Content Safety resource — the
 * checkpoint `30-SECOND-VENDORS.md` stage B has carried as pending since
 * 2026-09-02 (WP73, `62-THE-TAIL.md` §4.3).
 *
 * **Never runs in CI** (`10-CODING-STANDARDS.md` §5, the discipline
 * `pack-openai`'s and `pack-geap`'s smoke tests hold to). Not part of
 * `npm run test`; invoked deliberately:
 *
 *     AZURE_CONTENT_SAFETY_KEY=… AZURE_CONTENT_SAFETY_ENDPOINT=https://<resource>.cognitiveservices.azure.com \
 *       npm run smoke:azure
 *
 * Everything else about the pack is proven offline against the `2024-09-01`
 * reference shapes held as fixtures. The two things only a live call can
 * prove are that a real response parses — Shield Prompt over a known attack
 * and Analyze Text over a benign sentence — and how long the resource takes
 * to answer. It prints the block the doc's dated note wants and never prints
 * the key (hard rule 2, checked against the live payloads).
 *
 * The browser half — whether the resource answers a CORS preflight from the
 * Guard Rack, which decides `browserCapable` — is a click, not a script; the
 * last lines say how to take it.
 *
 * Exit status via `process.exitCode`, not `process.exit()` — the same
 * Windows/libuv reasoning `pack-openai`'s own smoke test documents.
 */
// Imported from `dist`, not `src`: the smoke test should exercise the
// artefact that actually ships. `npm run smoke` builds first.
import { KNOWN_ATTACK, createContentSafetyClient } from '../dist/index.js';

const BENIGN = 'Hello Teddy, I am your new robot! Shall we find the red key together?';

async function main(): Promise<number> {
	const key = process.env['AZURE_CONTENT_SAFETY_KEY'];
	const endpoint = process.env['AZURE_CONTENT_SAFETY_ENDPOINT'];

	if (!key || key.trim() === '' || !endpoint || endpoint.trim() === '') {
		console.log(
			'AZURE_CONTENT_SAFETY_KEY and AZURE_CONTENT_SAFETY_ENDPOINT are not both set — skipping the live smoke test.'
		);
		console.log(
			'A free-tier Azure AI Content Safety resource gives both (portal.azure.com → the resource → Keys and Endpoint); 30-SECOND-VENDORS.md §3 is the shape.'
		);
		return 0;
	}
	if (!/^https:\/\/[a-z0-9-]+\.cognitiveservices\.azure\.com\/?$/i.test(endpoint)) {
		console.error(
			`✗ the endpoint should look like https://<resource>.cognitiveservices.azure.com, not ${endpoint}`
		);
		return 1;
	}

	const client = createContentSafetyClient({
		endpoint: endpoint.replace(/\/$/, ''),
		fetch: globalThis.fetch,
		key: () => key
	});

	console.log(`Shielding a known-attack prompt against ${endpoint}…`);
	const shieldStart = performance.now();
	const shield = await client.shieldPrompt({ userPrompt: KNOWN_ATTACK });
	const shieldMs = Math.round(performance.now() - shieldStart);
	if ('error' in shield) {
		console.error(`\n✗ shieldPrompt ${shield.error.kind}: ${shield.error.message}`);
		return 1;
	}
	const detected = shield.body.userPromptAnalysis?.attackDetected;
	console.log(`  attackDetected     : ${String(detected)}`);
	console.log(`  latency            : ${shieldMs} ms`);
	if (detected !== true) {
		throw new Error(
			'the known-attack prompt was not detected — the resource, or the wire shape, has drifted'
		);
	}

	console.log('\nAnalysing a benign sentence…');
	const analyzeStart = performance.now();
	const analysis = await client.analyze(BENIGN);
	const analyzeMs = Math.round(performance.now() - analyzeStart);
	if ('error' in analysis) {
		console.error(`\n✗ analyze ${analysis.error.kind}: ${analysis.error.message}`);
		return 1;
	}
	const categories = analysis.body.categoriesAnalysis;
	for (const entry of categories) {
		console.log(`  ${entry.category.padEnd(11)}: severity ${entry.severity}`);
	}
	console.log(`  latency            : ${analyzeMs} ms`);
	if (categories.length === 0) {
		throw new Error('analyze returned no categories — the wire shape has drifted');
	}
	if (categories.some((entry) => entry.severity > 0)) {
		throw new Error(
			'a benign sentence scored above zero — read the raw response before trusting the reading'
		);
	}

	// Hard rule 2, checked against live payloads rather than fixtures.
	if (JSON.stringify(shield).includes(key) || JSON.stringify(analysis).includes(key)) {
		throw new Error('THE KEY APPEARS IN A RESPONSE — scrubbing is broken');
	}

	console.log(
		'\n✓ Live smoke test passed. Both wire shapes parse and the guard caught the attack.'
	);
	console.log('\nFor 30-SECOND-VENDORS.md §7 (the dated note):');
	console.log(
		`  taken ${new Date().toISOString().slice(0, 10)}; shieldPrompt attackDetected=true in ${shieldMs} ms; analyze ${categories.length} categories all at 0 in ${analyzeMs} ms; the key absent from both payloads.`
	);
	console.log(
		'\nThe browser half (CORS, which decides browserCapable): open /workshop/guards with the battery in, name the endpoint, press "Test the guard"; a verdict means the resource answers a browser, "could not check" with a network error means it does not.'
	);
	return 0;
}

main().then(
	(code) => {
		process.exitCode = code;
	},
	(error: unknown) => {
		console.error(`\n✗ ${error instanceof Error ? error.message : String(error)}`);
		process.exitCode = 1;
	}
);
