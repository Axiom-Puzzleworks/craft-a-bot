import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * **The committed-artefact sweep** (WP162, `112-REAL-ENOUGH-PLAN.md` §5, D9,
 * hard rule 2): the recorders refuse to write a key they hold, but a key the
 * process did *not* hold — pasted into a fixture, copied from a vendor's
 * example — would sail past that. So every committed cassette, benchmark
 * cassette, evidence file, corpus and campaign file is swept for the shapes
 * real credentials have. The shapes are the vendors' published prefixes, not a
 * guess at entropy: a match is a refusal, and the fix is to regenerate the
 * artefact, never to relax the shape.
 */
const ROOT = resolve(import.meta.dirname, '../../..');

const SHAPES: Array<[string, RegExp]> = [
	['an OpenAI or Anthropic key (sk-…)', /\bsk-[A-Za-z0-9_-]{20,}/],
	['a Google API key (AIza…)', /\bAIza[0-9A-Za-z_-]{30,}/],
	['a Google OAuth access token (ya29.…)', /\bya29\.[0-9A-Za-z_-]{20,}/],
	['an AWS access key id (AKIA…/ASIA…)', /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/],
	['a bearer token', /\bBearer\s+[A-Za-z0-9._~+/-]{24,}/],
	['a JWT', /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/],
	['a private key block', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
	['an Authorization header value', /"authorization"\s*:\s*"(?!\[key-redacted\])[^"]{12,}"/i]
];

/** The committed files that record or carry what a live service said. */
function swept(): string[] {
	const listed = execFileSync('git', ['ls-files'], {
		cwd: ROOT,
		encoding: 'utf8',
		maxBuffer: 64 << 20
	})
		.split('\n')
		.filter(Boolean);
	return listed.filter(
		(file) =>
			/\.(json|jsonl|md|txt)$/.test(file) &&
			(file.startsWith('docs/evidence/') ||
				file.startsWith('benchmarks/') ||
				file.startsWith('campaigns/') ||
				file.startsWith('experiments/') ||
				/cassette/i.test(file) ||
				/\/fixtures\/.*\.json$/.test(file) ||
				/\/corpora?\/.*\.json$/.test(file))
	);
}

describe('no committed artefact holds a credential', () => {
	const files = swept();

	it('sweeps a real set of files, so a path change cannot empty the check', () => {
		expect(files.length).toBeGreaterThan(40);
		expect(files.some((file) => file.startsWith('docs/evidence/'))).toBe(true);
		expect(files.some((file) => file.startsWith('benchmarks/cassettes/'))).toBe(true);
	});

	it('finds none of the shapes real credentials have', () => {
		const found: string[] = [];
		for (const file of files) {
			const text = readFileSync(resolve(ROOT, file), 'utf8');
			for (const [what, shape] of SHAPES) {
				const global = new RegExp(shape.source, `${shape.flags.replace('g', '')}g`);
				// A credential the desk generated on purpose carries SYNTHETIC in its body (`syntheticSecret`, rule 9): a scan matches it and a reader sees what it is.
				for (const match of text.matchAll(global))
					if (!match[0].includes('SYNTHETIC')) found.push(`${file}: ${what}`);
			}
		}
		expect(found).toEqual([]);
	});

	it('the shapes themselves match what they say (so the sweep can fail)', () => {
		const samples: Record<string, string> = {
			'an OpenAI or Anthropic key (sk-…)': 'sk-' + 'a1B2c3D4e5F6g7H8i9J0k1',
			'a Google API key (AIza…)': 'AIza' + 'SyA-1234567890abcdefghijklmnopqrstu',
			'a Google OAuth access token (ya29.…)': 'ya29.' + 'a0AfH6SMBabcdefghij12345',
			'an AWS access key id (AKIA…/ASIA…)': 'AKIA' + 'IOSFODNN7EXAMPLE',
			'a bearer token': 'Bearer ' + 'abcdefghijklmnopqrstuvwx12345',
			'a JWT': 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkw.SflKxwRJSMeKKF2QT4fwpMeJf36P',
			'a private key block': '-----BEGIN ' + 'RSA PRIVATE KEY-----',
			'an Authorization header value': '"authorization": "Basic dXNlcjpwYXNzd29yZA=="'
		};
		for (const [what, shape] of SHAPES) expect(shape.test(samples[what] ?? ''), what).toBe(true);
		// A scrubbed header is not a finding.
		expect(SHAPES.at(-1)![1].test('"authorization": "[key-redacted]"')).toBe(false);
	});
});
