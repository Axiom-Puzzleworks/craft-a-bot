import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildTraceBundle, parseTraceBundle, verifyBundleDigest } from '@craftabot/core';
import { provisionalRun } from '@craftabot/governance';
import { buildSpec } from '@craftabot/pack-starter/testing';

/**
 * The Python reader's fixture is the app's own output (WP73, `62-THE-TAIL.md`
 * §4.4): the bundle `buildTraceBundle` writes over the starter pack's
 * say-hello golden trace, with a fixed `exportedAt`. Built here the same way
 * and compared byte for byte, so the committed file is never hand-edited
 * and never drifts from what `craftabot bundle` would write. To refresh it
 * when the golden trace legitimately changes:
 *
 *     node --input-type=module -e "…" — or simply copy the `expected` this
 *     test prints on failure over the fixture.
 */
const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..', '..');
const GOLDEN = resolve(
	REPO,
	'packages',
	'packs',
	'starter',
	'src',
	'fixtures',
	'trace.say-hello.v1.json'
);
const FIXTURE = resolve(
	REPO,
	'examples',
	'python-reader',
	'fixtures',
	'say-hello.craftabot-bundle.json'
);

describe('examples/python-reader', () => {
	it('ships the bundle the app writes over the say-hello golden trace, byte for byte', async () => {
		const events = JSON.parse(readFileSync(GOLDEN, 'utf8'));
		// A provisional record carries no card (it is what an evaluator sees over bare events); the fixture names the golden's.
		const spec = buildSpec({ goalCardId: 'starter/say-hello' });
		const run = {
			...provisionalRun(events),
			agentName: spec.name,
			goalCardId: 'starter/say-hello',
			specSnapshot: spec
		};
		const bundle = await buildTraceBundle({
			runs: [{ run, events }],
			exportedBy: 'examples/python-reader',
			exportedAt: '2026-09-07T09:00:00.000Z'
		});
		const expected = `${JSON.stringify(bundle, null, '\t')}\n`;
		expect(readFileSync(FIXTURE, 'utf8')).toBe(expected);
		// And it is a bundle the app itself accepts and verifies — what the Python side recomputes.
		const parsed = parseTraceBundle(JSON.parse(expected));
		expect(await verifyBundleDigest(parsed)).toBe(true);
		expect(parsed.runs[0]?.events.length).toBeGreaterThan(10);
	});
});
