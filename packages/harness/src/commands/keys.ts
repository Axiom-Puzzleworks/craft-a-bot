import { containsSecret, type PackRegistry } from '@craftabot/core';
import { CREDENTIAL_PREFIX, MIN_SMOKE_SECRET_LENGTH, credentialVariable } from '../credentials.js';
import { harnessSinks } from '../sinks.js';

/**
 * **`craftabot keys check`** (WP162, `112-REAL-ENOUGH-PLAN.md` §5, D9): which
 * credentials this process holds, by id — never by value — and which services
 * each one lights. Read from what the installed packs declare, so a pack that
 * adds a hosted service appears here without anyone remembering to list it.
 *
 * It also names the *smoke* variables the live checkpoints read
 * (`OPENAI_API_KEY`, `GEAP_ACCESS_TOKEN`, …) and the harness credential each
 * stands beside, because the two are separate: a smoke script reads its own
 * variable, and a harness recording reads `CRAFTABOT_CREDENTIAL_<ID>`. A key
 * in one is not in the other, and the check says so.
 */
export interface KeyRow {
	/** The credential id a pack declared, as a provider or service names it. */
	id: string;
	/** The environment variable the harness reads it from. */
	variable: string;
	held: boolean;
	kind: string;
	/** Every piece of content that reads it: `provider openai`, `guard geap/model-armor`, … */
	lights: string[];
}

export interface SmokeRow {
	variable: string;
	/** Whether the value is a secret (scrubbed and refused everywhere) or configuration (a region, an id). */
	secret: boolean;
	set: boolean;
	/** The harness credential this variable stands beside, when it has one. */
	harnessCredential?: string;
	/** The npm script that reads it. */
	script: string;
}

export interface KeysReport {
	credentials: KeyRow[];
	smoke: SmokeRow[];
	/** Things worth saying: a smoke key set with no harness credential beside it, a half-set group. */
	notes: string[];
}

/** The smoke checkpoints' variables, from their scripts (`packages/packs/*\/scripts/smoke*.ts`). */
export const SMOKE_VARIABLES: ReadonlyArray<{
	variable: string;
	secret: boolean;
	script: string;
	harnessCredential?: string;
}> = [
	{ variable: 'OPENAI_API_KEY', secret: true, script: 'smoke:openai', harnessCredential: 'openai' },
	{ variable: 'GEAP_ACCESS_TOKEN', secret: true, script: 'smoke:geap', harnessCredential: 'geap' },
	{ variable: 'GEAP_PROJECT_ID', secret: false, script: 'smoke:geap' },
	{ variable: 'GEAP_LOCATION', secret: false, script: 'smoke:geap' },
	{ variable: 'GEAP_TEMPLATE_ID', secret: false, script: 'smoke:geap' },
	{
		variable: 'AZURE_CONTENT_SAFETY_KEY',
		secret: true,
		script: 'smoke:azure',
		harnessCredential: 'azure-content-safety'
	},
	{ variable: 'AZURE_CONTENT_SAFETY_ENDPOINT', secret: false, script: 'smoke:azure' },
	{
		variable: 'LAKERA_GUARD_KEY',
		secret: true,
		script: 'smoke:lakera',
		harnessCredential: 'lakera'
	},
	{ variable: 'LAKERA_GUARD_ENDPOINT', secret: false, script: 'smoke:lakera' },
	{ variable: 'AWS_BEDROCK_REGION', secret: false, script: 'smoke:bedrock' },
	{ variable: 'AWS_BEDROCK_GUARDRAIL_ID', secret: false, script: 'smoke:bedrock' },
	{ variable: 'AWS_BEDROCK_GUARDRAIL_VERSION', secret: false, script: 'smoke:bedrock' },
	{ variable: 'AWS_BEDROCK_AR_GUARDRAIL_ID', secret: false, script: 'smoke:bedrock-ar' },
	{ variable: 'AWS_BEDROCK_AR_GUARDRAIL_VERSION', secret: false, script: 'smoke:bedrock-ar' },
	{ variable: 'AWS_BEDROCK_AR_CLAIM', secret: false, script: 'smoke:bedrock-ar' },
	{ variable: 'AWS_VP_REGION', secret: false, script: 'smoke:cedar' },
	{ variable: 'AWS_VP_POLICY_STORE_ID', secret: false, script: 'smoke:cedar' },
	{ variable: 'AWS_VP_DENIED_ACTION', secret: false, script: 'smoke:cedar' }
];

const present = (env: NodeJS.ProcessEnv, name: string): boolean =>
	env[name] !== undefined && env[name]!.trim() !== '';

/** Every credential the registry's content (and the harness's sinks) declares, with who reads it and whether this environment holds it. */
export function keysCheck(registry: PackRegistry, env: NodeJS.ProcessEnv): KeysReport {
	const byId = new Map<string, KeyRow>();
	const light = (id: string, kind: string, by: string): void => {
		const row = byId.get(id) ?? {
			id,
			variable: credentialVariable(id),
			held: present(env, credentialVariable(id)),
			kind,
			lights: []
		};
		if (!row.lights.includes(by)) row.lights.push(by);
		byId.set(id, row);
	};
	for (const factory of registry.listProviderFactories())
		if (factory.keyRequirement === 'required')
			light(factory.id, 'api-key', `provider ${factory.id}`);
	for (const service of registry.listGuardrailServices())
		if (service.credential)
			light(service.credential.id, service.credential.kind, `guard ${service.id}`);
	for (const evaluator of registry.listEvaluators())
		if (evaluator.credential)
			light(evaluator.credential.id, evaluator.credential.kind, `evaluator ${evaluator.id}`);
	for (const reader of registry.listReaders())
		if (reader.credential)
			light(reader.credential.id, reader.credential.kind, `reader ${reader.id}`);
	for (const line of registry.listServiceLines())
		if (line.live?.credential)
			light(line.live.credential.id, line.live.credential.kind, `line ${line.id}`);
	for (const store of registry.listEvidenceStores())
		if (store.credential) light(store.credential.id, store.credential.kind, `store ${store.id}`);
	for (const sink of harnessSinks)
		if (sink.credential) light(sink.credential.id, sink.credential.kind, `sink ${sink.id}`);

	const credentials = [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
	const smoke: SmokeRow[] = SMOKE_VARIABLES.map((entry) => ({
		variable: entry.variable,
		secret: entry.secret,
		set: present(env, entry.variable),
		...(entry.harnessCredential ? { harnessCredential: entry.harnessCredential } : {}),
		script: entry.script
	}));

	const notes: string[] = [];
	// A placeholder in a key's place: set, but too short to be one, so nothing reads it as a key and nothing scrubs it.
	for (const row of smoke)
		if (row.secret && row.set) {
			const length = env[row.variable]!.trim().length;
			if (length < MIN_SMOKE_SECRET_LENGTH)
				notes.push(
					`${row.variable} is set but only ${length} characters: too short to be a key, so it is treated as a placeholder (not scrubbed, not used).`
				);
		}
	for (const row of smoke)
		if (row.secret && row.set && row.harnessCredential) {
			const variable = credentialVariable(row.harnessCredential);
			if (!present(env, variable))
				notes.push(
					`${row.variable} is set but ${variable} is not: the smoke script can use it and a harness recording cannot.`
				);
		}
	// A smoke script that is half set would skip itself: say which half.
	for (const script of [...new Set(SMOKE_VARIABLES.map((entry) => entry.script))]) {
		const rows = smoke.filter((row) => row.script === script);
		const set = rows.filter((row) => row.set);
		if (set.length > 0 && set.length < rows.length && script !== 'smoke:openai')
			notes.push(
				`${script} is partly set (missing ${rows
					.filter((row) => !row.set)
					.map((row) => row.variable)
					.join(', ')}).`
			);
	}
	// Anything the harness would read that no content declares: a typo in a variable name.
	const declared = new Set(credentials.map((row) => row.variable));
	for (const name of Object.keys(env))
		if (name.startsWith(CREDENTIAL_PREFIX) && present(env, name) && !declared.has(name))
			notes.push(`${name} is set but no installed content declares that credential.`);
	return { credentials, smoke, notes };
}

/** The report as lines for a terminal — ids and set/unset only, never a value. */
export function renderKeys(report: KeysReport): string {
	const lines = ['credentials the harness reads (CRAFTABOT_CREDENTIAL_<ID>):'];
	for (const row of report.credentials)
		lines.push(
			`  ${row.held ? 'held   ' : 'missing'}  ${row.variable.padEnd(48)} ${row.lights.join(', ')}`
		);
	lines.push('', 'variables the live smoke scripts read:');
	for (const row of report.smoke)
		lines.push(
			`  ${row.set ? 'set    ' : 'unset  '}  ${row.variable.padEnd(36)} ${row.script}${row.secret ? '' : ' (not a secret)'}`
		);
	if (report.notes.length > 0) lines.push('', ...report.notes.map((note) => `note: ${note}`));
	return `${lines.join('\n')}\n`;
}

/**
 * **A recorder's last gate** (WP162): refuses to write an artefact that holds
 * any secret the process holds — a response body that echoed a key, a header a
 * scrub missed. The message names what was refused and never the secret. Every
 * recorder (`record`, `record --experiment`, `benchmark run --record`) calls it,
 * because the exact-match scrub is not a net for a key inside a sentence.
 */
export function refuseSecrets(artefact: unknown, secrets: readonly string[], what: string): void {
	if (containsSecret(artefact, secrets))
		throw new Error(
			`refusing to write ${what}: it contains a credential this process holds. Nothing was written.`
		);
}
