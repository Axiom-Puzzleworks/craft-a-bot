import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { main, parseArgs } from '../cli.js';
import { scaffoldDomainFiles, scaffoldDomainFormatted } from './scaffold.js';

/**
 * **The scaffold** (WP107, `93-DOMAIN-PACK.md` §4): `examples/scaffold-domain`
 * is what `craftabot scaffold domain` writes for the options on its README,
 * byte for byte — regenerate it, never edit it. The example's own tests
 * hold the output to `checkDomainPack` (green) and to calibration review
 * (red), and run the scaffolded journey's golden run and book.
 */
const HERE = dirname(fileURLToPath(import.meta.url));
const EXAMPLE = join(HERE, '..', '..', '..', '..', 'examples', 'scaffold-domain');
const OPTIONS = {
	id: 'veterinary-practice',
	sector: 'Veterinary services',
	jurisdiction: 'UK',
	world: 'vet-practice',
	journeys: ['vaccination', 'referral'],
	root: 'Patient',
	today: '2026-09-12',
	relative: true,
	out: EXAMPLE
};

const walk = (dir: string): string[] =>
	readdirSync(dir).flatMap((name) => {
		const path = join(dir, name);
		if (name === 'node_modules' || name === 'dist' || name.startsWith('.')) return [];
		return statSync(path).isDirectory() ? walk(path) : [path];
	});

describe('craftabot scaffold domain', () => {
	it(
		'examples/scaffold-domain is the scaffold’s output, byte for byte',
		{ timeout: 60_000 },
		async () => {
			const files = await scaffoldDomainFormatted(OPTIONS);
			const onDisk = walk(EXAMPLE)
				.map((path) => relative(EXAMPLE, path).replaceAll('\\', '/'))
				.sort();
			expect(onDisk).toEqual(files.map((file) => file.path).sort());
			for (const file of files) {
				expect(readFileSync(join(EXAMPLE, file.path), 'utf8'), file.path).toBe(file.text);
			}
		}
	);

	it('writes one workspace with --relative and a package per pack without it', () => {
		const one = scaffoldDomainFiles(OPTIONS).map((file) => file.path);
		expect(one).toContain('package.json');
		expect(one).not.toContain('vet-practice/package.json');
		const many = scaffoldDomainFiles({ ...OPTIONS, relative: false }).map((file) => file.path);
		expect(many).not.toContain('package.json');
		expect(many).toEqual(
			expect.arrayContaining([
				'vet-practice/package.json',
				'vet-practice/tsconfig.build.json',
				'vaccination/package.json',
				'referral/package.json'
			])
		);
		const desk = scaffoldDomainFiles({ ...OPTIONS, relative: false }).find(
			(file) => file.path === 'vaccination/src/desk.ts'
		)!;
		expect(desk.text).toContain("from '@craftabot/pack-vet-practice'");
	});

	it('is pure over its options', () => {
		expect(scaffoldDomainFiles(OPTIONS)).toEqual(scaffoldDomainFiles(OPTIONS));
		const other = scaffoldDomainFiles({ ...OPTIONS, journeys: ['vaccination'] });
		expect(other.map((file) => file.path)).not.toContain('referral/src/desk.ts');
	});

	it('refuses a call without its verb or a journey', async () => {
		const errors: string[] = [];
		const io = { stdout: () => {}, stderr: (text: string) => errors.push(text), env: {} };
		expect(await main(['scaffold', '--id', 'x'], io)).toBe(1);
		expect(errors.join('')).toMatch(/scaffold needs domain/);
		expect(parseArgs(['scaffold', 'domain', '--relative', '--out', 'x']).flags['relative']).toBe(
			true
		);
	});
});
