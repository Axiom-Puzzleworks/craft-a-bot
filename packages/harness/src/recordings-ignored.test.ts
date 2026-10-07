import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * **A live run's own store is never committed** (`113-RECORDING-AND-RELIABILITY.md`
 * D1, WP189): `recordings/` holds every prompt, event and outcome of a live
 * recording, kept for audit. The committed cassette regenerates a transcript by
 * replay; the original stays local, so git must be told to ignore it.
 */
const ROOT = resolve(import.meta.dirname, '../../..');

describe('recordings/ is gitignored (WP189)', () => {
	it('names the directory a live recording keeps its store in', () => {
		const ignored = execFileSync(
			'git',
			['check-ignore', 'recordings/lending-stack-live/trial-0/runs/runs/x/events.jsonl'],
			{ cwd: ROOT, encoding: 'utf8' }
		);
		expect(ignored.trim()).toBe('recordings/lending-stack-live/trial-0/runs/runs/x/events.jsonl');
	});
});
