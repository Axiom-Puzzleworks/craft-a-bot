#!/usr/bin/env node
/**
 * **`@craftabot/governance` 1.0.0, installed from its tarball** (WP126,
 * `docs/design-day2/101-DAY7-ROADMAP.md`). Packs `@craftabot/core`,
 * `@craftabot/metrics` and `@craftabot/governance` as `npm publish` would,
 * installs the three tarballs into a fresh copy of the built
 * `examples/plain-node-agent` — no workspace, no symlink — and holds:
 *
 * - the metadata a registry would show: name, a `1.0.0` version, the licence,
 *   the repository, `types` and the two subpath exports, and dependency
 *   ranges (never `*`) on the packages it needs;
 * - the readers and the injection components importable from the installed
 *   package, and a rule reader answering;
 * - the example running from the installed tarballs to its four outcomes,
 *   the reader annotating the identifier.
 *
 * Run after `npm run build`; exit 1 on any finding. Needs the registry (or
 * npm's cache) for `zod`, the one third-party dependency.
 */
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const repo = resolve(import.meta.dirname, '..');
const scratch = mkdtempSync(join(tmpdir(), 'governance-install-'));
const problems = [];
const run = (command, cwd) =>
	spawnSync(command, {
		cwd,
		encoding: 'utf8',
		shell: true,
		env: { ...process.env, npm_config_audit: 'false', npm_config_fund: 'false' }
	});

try {
	const tarballs = {};
	for (const workspace of ['packages/core', 'packages/metrics', 'packages/governance']) {
		const packed = run(
			`npm pack --json --workspace ${workspace} --pack-destination "${scratch}"`,
			repo
		);
		if (packed.status !== 0) throw new Error(`npm pack ${workspace}: ${packed.stderr}`);
		const [manifest] = JSON.parse(packed.stdout);
		tarballs[manifest.name] = join(scratch, manifest.filename);
	}

	const app = join(scratch, 'app');
	cpSync(join(repo, 'examples/plain-node-agent/dist'), join(app, 'dist'), { recursive: true });
	const zod = JSON.parse(readFileSync(join(repo, 'packages/governance/package.json'), 'utf8'))
		.dependencies.zod;
	writeFileSync(
		join(app, 'package.json'),
		JSON.stringify({
			name: 'governance-install-check',
			private: true,
			type: 'module',
			dependencies: {
				...Object.fromEntries(
					Object.entries(tarballs).map(([name, path]) => [name, `file:${path}`])
				),
				zod
			}
		})
	);
	const installed = run('npm install --prefer-offline --no-package-lock', app);
	if (installed.status !== 0) throw new Error(`npm install: ${installed.stderr}`);

	// The metadata a registry would show.
	const meta = JSON.parse(
		readFileSync(join(app, 'node_modules/@craftabot/governance/package.json'), 'utf8')
	);
	if (meta.version !== '1.0.0') problems.push(`version is ${meta.version}, not 1.0.0`);
	if (meta.license !== 'Apache-2.0') problems.push(`licence is ${meta.license}`);
	if (!meta.repository?.url) problems.push('no repository');
	if (!meta.types) problems.push('no types');
	for (const subpath of ['.', './reports'])
		if (!meta.exports?.[subpath]) problems.push(`no "${subpath}" export`);
	for (const [name, range] of Object.entries(meta.dependencies ?? {}))
		if (range === '*' || range === '')
			problems.push(`dependency ${name} has no range ("${range}")`);

	// The readers and the injection components, from the installed package.
	const probe = join(app, 'probe.mjs');
	writeFileSync(
		probe,
		`import * as governance from '@craftabot/governance';
const wanted = ['ruleReader', 'hostedReader', 'llmReader', 'readerComponent', 'quarantinedReaderComponent', 'untrustedContentComponent', 'taintComponent', 'foldFirstToken'];
const missing = wanted.filter((name) => typeof governance[name] !== 'function' && typeof governance[name] !== 'object');
if (missing.length) { console.error('missing: ' + missing.join(', ')); process.exit(1); }
const reader = governance.ruleReader({ id: 'probe/reader', name: 'Probe', description: 'Probe.', answers: ['noul'], rules: { yes: () => true } });
const response = await reader.ask('x', { yes: { type: 'noul', instructions: 'Yes?' } }, {});
if (response.answers.yes?.noul !== 1) { console.error('the rule reader did not answer'); process.exit(1); }
console.log('readers importable: ' + wanted.length);
`
	);
	const probed = run(`node "${probe}"`, app);
	if (probed.status !== 0) problems.push(`probe: ${probed.stderr.trim()}`);

	// The example, from the tarballs.
	const example = run('node dist/main.js', app);
	if (example.status !== 0) problems.push(`the example failed: ${example.stderr.trim()}`);
	else {
		if (!example.stdout.includes('7 proposals, 3 allowed, 4 refused'))
			problems.push('the example did not reach its four outcomes');
		if (!example.stdout.includes('example/guard/identifier@pre-act → annotate'))
			problems.push('the reader did not annotate the identifier');
	}

	if (problems.length > 0) {
		console.error(`governance install check failed:\n  ${problems.join('\n  ')}`);
		process.exitCode = 1;
	} else {
		console.log(
			`@craftabot/governance ${meta.version} installs from its tarball: ${probed.stdout.trim()}; the example reaches its four outcomes with the reader annotating`
		);
	}
} finally {
	rmSync(scratch, { recursive: true, force: true });
}
