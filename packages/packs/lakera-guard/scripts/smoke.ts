/**
 * Live smoke test against Lakera Guard — the checkpoint `30-SECOND-VENDORS.md`'s
 * WP99 note carries as pending. **Never runs in CI** (`10-…` §5); invoked deliberately:
 *
 *     LAKERA_GUARD_KEY=… npm run smoke:lakera
 *
 * The one thing only a live call can prove is that a real `/v2/guard` answer
 * parses and flags the known attack. It never prints the key (hard rule 2).
 * The browser half — whether the API answers a CORS preflight — is a click
 * from the Guard Rack, not a script; the last line says so.
 */
import { KNOWN_ATTACK, createLakeraClient } from '../dist/index.js';

async function main(): Promise<number> {
	const key = process.env['LAKERA_GUARD_KEY'];
	if (!key || key.trim() === '') {
		console.log('LAKERA_GUARD_KEY is not set — skipping the live smoke test.');
		console.log('A Lakera Guard API key (platform.lakera.ai → API keys) is all it needs.');
		return 0;
	}
	const client = createLakeraClient({
		endpoint: process.env['LAKERA_GUARD_ENDPOINT'] ?? 'https://api.lakera.ai',
		fetch: globalThis.fetch,
		key: () => key
	});
	console.log('Screening a known-attack prompt…');
	const start = performance.now();
	const result = await client.guard(KNOWN_ATTACK);
	const ms = Math.round(performance.now() - start);
	if ('error' in result) {
		console.error(`✗ ${result.error.kind}: ${result.error.message} (${ms} ms)`);
		return 1;
	}
	console.log(
		`✓ answered in ${ms} ms — flagged: ${result.body.flagged}; detectors: ${result.body.breakdown.map((row) => `${row.detector_type}=${row.detected}`).join(', ')}`
	);
	if (!result.body.flagged) {
		console.error('✗ the known attack was not flagged — check the project’s policy.');
		return 1;
	}
	console.log('Record the date and the timing in 30-SECOND-VENDORS.md’s WP99 note.');
	console.log(
		'The browser checkpoint: open /workshop/guards in the harness-built full edition, plug the key in, and press "Test the guard" — a CORS refusal in the console decides browserCapable.'
	);
	return 0;
}

main().then((code) => {
	process.exitCode = code;
});
