import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Runs `examples/python-reader/` the way CI does (WP73, `62-THE-TAIL.md`
 * §4.4): finds a Python 3 on `PATH`, makes the example's own venv, installs
 * its one requirement, reads the committed fixture (must pass) and a copy
 * with one byte of an event changed (must fail). With no Python it says so
 * and exits 0 — `41-…` §6.16's "in CI only if `python3` is present" decided
 * here rather than assumed by the workflow.
 */
const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const EXAMPLE = join(REPO, 'examples', 'python-reader');
const FIXTURE = join(EXAMPLE, 'fixtures', 'say-hello.craftabot-bundle.json');
const VENV = join(EXAMPLE, '.venv');
const WINDOWS = process.platform === 'win32';

const run = (command, args, options = {}) =>
	spawnSync(command, args, { encoding: 'utf8', shell: false, ...options });

function findPython() {
	for (const candidate of ['python3', 'python']) {
		const probe = run(candidate, ['--version']);
		const version = `${probe.stdout ?? ''}${probe.stderr ?? ''}`.trim();
		if (probe.status === 0 && /^Python 3\./.test(version)) return { candidate, version };
	}
	return undefined;
}

const python = findPython();
if (!python) {
	console.log('python-reader: skipped — no python3 on PATH.');
	process.exit(0);
}
console.log(`python-reader: ${python.version} (${python.candidate})`);

const venvPython = WINDOWS ? join(VENV, 'Scripts', 'python.exe') : join(VENV, 'bin', 'python');
if (!existsSync(venvPython)) {
	const made = run(python.candidate, ['-m', 'venv', VENV], { stdio: 'inherit' });
	if (made.status !== 0) {
		console.error('python-reader: could not create the venv');
		process.exit(made.status ?? 1);
	}
}
const installed = run(
	venvPython,
	[
		'-m',
		'pip',
		'install',
		'--quiet',
		'--disable-pip-version-check',
		'-r',
		join(EXAMPLE, 'requirements.txt')
	],
	{ stdio: 'inherit' }
);
if (installed.status !== 0) {
	console.error('python-reader: pip install failed');
	process.exit(installed.status ?? 1);
}

const read = (bundlePath) =>
	run(venvPython, [join(EXAMPLE, 'read_bundle.py'), bundlePath], {
		stdio: 'inherit',
		env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
	});

console.log('\npython-reader: the committed fixture —');
const good = read(FIXTURE);
if (good.status !== 0) {
	console.error('python-reader: the fixture should validate and verify');
	process.exit(1);
}

// One byte changed inside an event: the schema still passes, the digest must not.
const bundle = JSON.parse(readFileSync(FIXTURE, 'utf8'));
const first = bundle.runs[0].events[0];
first.tick = (first.tick ?? 0) + 1;
const scratch = mkdtempSync(join(tmpdir(), 'python-reader-'));
const corrupted = join(scratch, 'corrupted.craftabot-bundle.json');
writeFileSync(corrupted, JSON.stringify(bundle));
console.log('\npython-reader: the same bundle with one event changed —');
const bad = read(corrupted);
rmSync(scratch, { recursive: true, force: true });
if (bad.status === 0) {
	console.error('python-reader: a changed event must fail the digest check');
	process.exit(1);
}
console.log('\npython-reader: ✓ validates, verifies, and refuses a changed bundle.');
