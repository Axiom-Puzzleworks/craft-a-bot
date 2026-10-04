import { spawn } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import {
	SPARK_MODE_ID_PATTERN,
	SPARK_OFF,
	SPARK_PATTERNS,
	SPARK_UNITS,
	cartridgesReady,
	checkSparkPattern,
	patternsServing,
	planSparkPattern,
	rolesReady,
	sparkCartridgesIn,
	sparkModeById,
	sparkPatternById,
	surveySparks,
	type SparkPattern,
	type SparkPlan,
	type SparkRoleReadiness,
	type SparkUnitId,
	type SparkUnitState,
	type SurveyedUnit
} from '@craftabot/pack-dgx-spark';

/**
 * **`craftabot spark`** (`99-DGX-SPARK.md` §9): the one way Craft A Bot stands
 * the builder's two DGX Sparks up, shuts them down and swaps one use of them
 * for another. The Sparks have other uses (the puzzle generator, the fairness
 * project, coding agents, image and video), so this never assumes it owns
 * them:
 *
 * - `status` and `plan` and `verify` only *look* (HTTP to the four hosts, and
 *   one read-only `docker ps` over ssh to learn the mode).
 * - `up` and `down` change what a unit runs, and say what they would stop
 *   first. They need `--yes`.
 * - `up` records the **lease**: what each unit was doing before. A second `up`
 *   (another pattern *replacing* the first) keeps the original, so `down` puts
 *   the Sparks back as they were found, not as the last pattern left them.
 * - Switching is the Spark project's own `switch.sh`, run over ssh on the unit.
 *   A mode id is only ever sent if it is a plain folder name the catalogue knows.
 */

export interface ShellResult {
	code: number;
	stdout: string;
	stderr: string;
}

/** Runs one command on a unit by its ssh alias. The default is `ssh`; tests supply a fake. */
export interface SparkShell {
	run(alias: string, command: string, timeoutMs: number): Promise<ShellResult>;
}

export const sshShell: SparkShell = {
	run: (alias, command, timeoutMs) =>
		new Promise((resolve) => {
			const child = spawn(
				'ssh',
				['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=8', alias, command],
				{ stdio: ['ignore', 'pipe', 'pipe'] }
			);
			let stdout = '';
			let stderr = '';
			const timer = setTimeout(() => child.kill(), timeoutMs);
			child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString()));
			child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
			child.on('error', (error) => {
				clearTimeout(timer);
				resolve({ code: 127, stdout, stderr: `${stderr}${error.message}` });
			});
			child.on('close', (code) => {
				clearTimeout(timer);
				resolve({ code: code ?? 1, stdout, stderr });
			});
		})
};

export interface SparkLease {
	/** The pattern up now. */
	pattern: string;
	startedAt: string;
	/** What each unit was doing when the first pattern took it, or `unknown` when it could not be asked. */
	previous: Partial<Record<SparkUnitId, string>>;
}

export interface SparkDeps {
	shell: SparkShell;
	fetch: typeof globalThis.fetch;
	leaseFile: string;
	now: () => Date;
	sleep: (ms: number) => Promise<void>;
	log: (line: string) => void;
}

export const DEFAULT_LEASE_FILE = '.craftabot/spark-lease.json';

export function defaultSparkDeps(log: (line: string) => void, leaseFile?: string): SparkDeps {
	return {
		shell: sshShell,
		fetch: globalThis.fetch,
		leaseFile: leaseFile ?? DEFAULT_LEASE_FILE,
		now: () => new Date(),
		sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
		log
	};
}

export async function readLease(file: string): Promise<SparkLease | undefined> {
	try {
		const parsed = JSON.parse(await readFile(file, 'utf8')) as Partial<SparkLease>;
		return typeof parsed.pattern === 'string' && parsed.previous
			? (parsed as SparkLease)
			: undefined;
	} catch {
		return undefined;
	}
}

async function writeLease(file: string, lease: SparkLease): Promise<void> {
	await mkdir(dirname(file), { recursive: true });
	await writeFile(file, `${JSON.stringify(lease, null, '\t')}\n`, 'utf8');
}

/** The compose projects the Sparks start modes under are `mode-<folder>`; a unit with none is `off`. */
const MODE_QUERY = `docker ps --format '{{.Label "com.docker.compose.project"}}' | grep '^mode-' | sort -u`;

/**
 * What the units are, now: HTTP for what they serve and their reachability, and
 * ssh for the exact mode (the inference from names stands in when ssh does not
 * answer). Read-only.
 */
export async function observeSparks(deps: SparkDeps): Promise<SurveyedUnit[]> {
	const surveyed = await surveySparks(deps.fetch);
	return Promise.all(
		surveyed.map(async (unit) => {
			const alias = SPARK_UNITS.find((u) => u.id === unit.unit)!.ssh;
			const answer = await deps.shell.run(alias, MODE_QUERY, 15_000);
			// `grep` finds nothing -> exit 1 with no output: no mode stack is running.
			if (answer.code !== 0 && answer.code !== 1) return unit;
			const modes = answer.stdout
				.split('\n')
				.map((line) => line.trim())
				.filter((line) => line.startsWith('mode-'))
				.map((line) => line.slice('mode-'.length));
			if (modes.length === 0) return { ...unit, mode: SPARK_OFF, modeFrom: 'ssh' as const };
			if (modes.length > 1) return { ...unit, mode: 'unknown', modeFrom: 'ssh' as const };
			return { ...unit, mode: modes[0]!, modeFrom: 'ssh' as const };
		})
	);
}

const word = (text: string, width: number) => text.padEnd(width);

export function renderStatus(units: SurveyedUnit[], lease: SparkLease | undefined): string {
	const lines = ['The DGX Sparks:'];
	for (const unit of units) {
		const mode = sparkModeById(unit.mode);
		const served = unit.models.map(
			(m) => `${m.id}${m.maxModelLen ? ` (${m.maxModelLen} ctx)` : ''}`
		);
		lines.push(
			`  ${word(unit.unit, 11)} ${
				unit.reachable
					? `${word(unit.mode, 12)} ${mode ? `[${mode.owner}] ` : ''}${served.join(', ') || 'serving nothing'}  via ${unit.via}`
					: 'UNREACHABLE (not on this network, powered off, or Tailscale is down)'
			}${unit.modeFrom === 'inferred' ? '  (mode inferred from the names it serves; ssh did not answer)' : ''}`
		);
	}
	lines.push(
		lease
			? `  lease: pattern "${lease.pattern}" since ${lease.startedAt}; \`craftabot spark down --yes\` puts back ${Object.entries(
					lease.previous
				)
					.map(([u, m]) => `${u}: ${m}`)
					.join(', ')}`
			: '  lease: none (Craft A Bot has not changed the Sparks)'
	);
	return `${lines.join('\n')}\n`;
}

export function renderPlan(plan: SparkPlan, pattern: SparkPattern): string {
	const lines = [`Pattern "${pattern.id}": ${pattern.title}`, `  ${pattern.purpose}`];
	for (const u of plan.units) {
		const to = sparkModeById(u.to);
		lines.push(
			`  ${word(u.unit, 11)} ${
				u.action === 'keep'
					? `${u.to} already (nothing to do)`
					: u.action === 'unreachable'
						? 'UNREACHABLE: cannot be planned'
						: `${u.from} -> ${u.to}${to ? ` (~${to.loadMinutes} min)` : ''}${
								u.stops ? `; stops ${u.stops.mode}, the ${u.stops.owner} mode` : ''
							}`
			}`
		);
	}
	lines.push(
		plan.changes ? `  about ${plan.minutes} min, the units switch in parallel` : '  nothing changes'
	);
	return `${lines.join('\n')}\n`;
}

export function renderReadiness(rows: VerifyResult['rows']): string {
	return `${rows
		.map(
			(r) =>
				`  ${r.ready ? 'ready  ' : 'MISSING'} ${word(r.label, 9)} ${word(r.cartridge, 22)} ${
					r.ready ? `on ${r.units.join(', ')}` : r.why
				}`
		)
		.join('\n')}\n`;
}

/** The pattern a command names: a shipped id, or a JSON file that must pass the same check. */
export async function resolvePattern(
	id: string | undefined,
	file: string | undefined
): Promise<SparkPattern> {
	let pattern: SparkPattern | undefined;
	if (file !== undefined) pattern = JSON.parse(await readFile(file, 'utf8')) as SparkPattern;
	else if (id !== undefined) pattern = sparkPatternById(id);
	if (!pattern)
		throw new Error(
			`spark needs --pattern <${SPARK_PATTERNS.map((p) => p.id).join('|')}> or --pattern-file <pattern.json>`
		);
	const problems = checkSparkPattern(pattern);
	if (problems.length > 0) throw new Error(problems.join('\n'));
	return pattern;
}

export interface UpResult {
	ok: boolean;
	changed: boolean;
	plan: SparkPlan;
	roles: SparkRoleReadiness[];
	failed: SparkUnitId[];
}

/** The switch command for one unit: only a catalogue mode (or `off`) is ever put in a command line. */
function switchCommand(mode: string): string {
	if (mode !== SPARK_OFF && (!SPARK_MODE_ID_PATTERN.test(mode) || !sparkModeById(mode)))
		throw new Error(`"${mode}" is not a mode the catalogue knows`);
	return `bash ~/stacks/modes/switch.sh ${mode}`;
}

const SWITCH_TIMEOUT_MS = 25 * 60_000;

/**
 * Stand a pattern up. Refuses shared modes (they are two coordinated steps
 * with a model chosen per run: `scripts/spark-mode.sh shared`), refuses to
 * plan over an unreachable unit, and writes the lease *before* the first
 * switch, so an interrupted `up` can still be put back with `down`.
 */
export async function sparkUp(
	deps: SparkDeps,
	pattern: SparkPattern,
	options: { settleMs?: number } = {}
): Promise<UpResult> {
	for (const mode of Object.values(pattern.units))
		if (sparkModeById(String(mode))?.kind === 'shared')
			throw new Error(
				'a shared mode runs one model across both units and is started with `scripts/spark-mode.sh shared <model>` in the Spark project, not by a pattern'
			);
	const before = await observeSparks(deps);
	const plan = planSparkPattern(pattern, before);
	if (plan.units.some((u) => u.action === 'unreachable'))
		throw new Error(
			`cannot stand up "${pattern.id}": ${plan.units
				.filter((u) => u.action === 'unreachable')
				.map((u) => u.unit)
				.join(', ')} is unreachable`
		);
	if (!plan.changes) {
		const rows = rolesReady(pattern.roles, before);
		return { ok: rows.every((r) => r.ready), changed: false, plan, roles: rows, failed: [] };
	}
	// The lease first: it keeps what the units were doing before any pattern, across replacements.
	const existing = await readLease(deps.leaseFile);
	const previous: SparkLease['previous'] = { ...existing?.previous };
	for (const unit of Object.keys(pattern.units) as SparkUnitId[])
		if (previous[unit] === undefined)
			previous[unit] = before.find((b) => b.unit === unit)?.mode ?? 'unknown';
	await writeLease(deps.leaseFile, {
		pattern: pattern.id,
		startedAt: existing?.startedAt ?? deps.now().toISOString(),
		previous
	});

	const failed: SparkUnitId[] = [];
	await Promise.all(
		plan.units
			.filter((u) => u.action === 'switch')
			.map(async (u) => {
				const alias = SPARK_UNITS.find((s) => s.id === u.unit)!.ssh;
				deps.log(`  ${u.unit}: ${u.from} -> ${u.to} ...`);
				const result = await deps.shell.run(alias, switchCommand(u.to), SWITCH_TIMEOUT_MS);
				const said = `${result.stdout}\n${result.stderr}`;
				const good =
					result.code === 0 &&
					(u.to === SPARK_OFF || /READY/.test(said)) &&
					!/FAILED|TIMEOUT|unknown mode/.test(said);
				if (!good) failed.push(u.unit);
				deps.log(`  ${u.unit}: ${good ? 'done' : `FAILED (exit ${result.code})`}`);
			})
	);

	// Models are listed a moment after the health check passes; give the survey a short while.
	let after = await observeSparks(deps);
	for (let waited = 0; waited < (options.settleMs ?? 60_000); waited += 5_000) {
		if (rolesReady(pattern.roles, after).every((r) => r.ready)) break;
		await deps.sleep(5_000);
		after = await observeSparks(deps);
	}
	const rows = rolesReady(pattern.roles, after);
	return {
		ok: failed.length === 0 && rows.every((r) => r.ready),
		changed: true,
		plan,
		roles: rows,
		failed
	};
}

export interface DownResult {
	restored: Array<{ unit: SparkUnitId; from: string; to: string; ok: boolean }>;
	skipped: Array<{ unit: SparkUnitId; why: string }>;
}

/**
 * Put the Sparks back as the first pattern found them (or stop them with
 * `off`), then clear the lease. A unit whose earlier mode could not be learned
 * is left as it is and named, never guessed at.
 */
export async function sparkDown(
	deps: SparkDeps,
	options: { off?: boolean } = {}
): Promise<DownResult> {
	const lease = await readLease(deps.leaseFile);
	if (!lease && !options.off)
		throw new Error(
			'no lease: Craft A Bot has not changed the Sparks, so there is nothing to put back (use --off to stop them)'
		);
	const units = options.off
		? (SPARK_UNITS.map((u) => u.id) as SparkUnitId[])
		: (Object.keys(lease!.previous) as SparkUnitId[]);
	const now = await observeSparks(deps);
	const result: DownResult = { restored: [], skipped: [] };
	await Promise.all(
		units.map(async (unit) => {
			const current = now.find((n) => n.unit === unit);
			const target = options.off ? SPARK_OFF : (lease!.previous[unit] ?? 'unknown');
			if (!current?.reachable) return void result.skipped.push({ unit, why: 'unreachable' });
			if (target === 'unknown')
				return void result.skipped.push({
					unit,
					why: 'what it was doing before could not be learned, so it is left as it is'
				});
			if (current.mode === target) return;
			const alias = SPARK_UNITS.find((s) => s.id === unit)!.ssh;
			deps.log(`  ${unit}: ${current.mode} -> ${target} ...`);
			const answer = await deps.shell.run(alias, switchCommand(target), SWITCH_TIMEOUT_MS);
			const said = `${answer.stdout}\n${answer.stderr}`;
			const ok =
				answer.code === 0 &&
				(target === SPARK_OFF || /READY/.test(said)) &&
				!/FAILED|TIMEOUT/.test(said);
			result.restored.push({ unit, from: current.mode, to: target, ok });
		})
	);
	// The lease stays when a retry could still help (a switch failed, a unit was out of reach); it goes when nothing more can be done.
	const retryable =
		result.restored.some((r) => !r.ok) || result.skipped.some((k) => k.why === 'unreachable');
	if (!retryable) await rm(deps.leaseFile, { force: true });
	return result;
}

export interface VerifyResult {
	ok: boolean;
	/** One row per role of a pattern, or per cartridge a design names. */
	rows: Array<{
		label: string;
		cartridge: string;
		ready: boolean;
		units: SparkUnitId[];
		why?: string;
	}>;
	/** Shipped patterns that would serve what is missing. */
	suggest: SparkPattern[];
}

/** Read-only: can what is asked for be served now? A pattern's roles, or the cartridges a design file names. */
export async function sparkVerify(
	deps: SparkDeps,
	what: { pattern?: SparkPattern; document?: unknown }
): Promise<VerifyResult> {
	const units: SparkUnitState[] = await observeSparks(deps);
	const rows: VerifyResult['rows'] = what.pattern
		? rolesReady(what.pattern.roles, units).map(({ role, ...rest }) => ({ label: role, ...rest }))
		: cartridgesReady(sparkCartridgesIn(what.document), units).map((row) => ({
				label: 'needs',
				...row
			}));
	const missing = rows.filter((row) => !row.ready);
	return {
		ok: missing.length === 0,
		rows,
		suggest: missing.length === 0 ? [] : patternsServing(rows.map((row) => row.cartridge))
	};
}

/**
 * The refusal `record --experiment --provider dgx-spark` makes before its first
 * call: a design whose Spark cartridges nothing is serving fails in a second
 * and says which pattern to stand up, not after the first cell errors.
 */
export async function sparkPreflight(
	deps: SparkDeps,
	document: unknown
): Promise<string | undefined> {
	if (sparkCartridgesIn(document).length === 0) return undefined;
	const verified = await sparkVerify(deps, { document });
	if (verified.ok) return undefined;
	const missing = verified.rows.filter((row) => !row.ready);
	return [
		'the Sparks are not serving what this design asks for:',
		...missing.map((row) => `  ${row.cartridge}: ${row.why}`),
		verified.suggest.length > 0
			? `Stand one up (it says what it would stop first): ${verified.suggest
					.map((p) => `craftabot spark up --pattern ${p.id}`)
					.join('  or  ')}`
			: 'No shipped pattern serves all of these together; see `craftabot spark patterns`.'
	].join('\n');
}
