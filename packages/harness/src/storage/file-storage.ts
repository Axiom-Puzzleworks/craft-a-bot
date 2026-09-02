import { mkdir, readdir, readFile, rm, stat, writeFile, appendFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
	DEFAULT_RUN_CAP,
	byNewestCreated,
	byNewestFirst,
	emptyQuarantine,
	migrateAgentRecord,
	safeParseAgentRecord,
	safeParseRunSummary,
	safeParseEvaluationRecord,
	safeParseStoredCampaignReport,
	safeParseStoredEvent,
	selectRunsToEvict,
	type AgentRecord,
	type EngineEvent,
	type GroupRunRecord,
	type QuarantineReport,
	type RunRecord,
	type RunSummary,
	type Storage,
	type EvaluationRecord,
	type StoredCampaignReport,
	type StoredEvent
} from '@craftabot/core';

/**
 * **The headless host's store** (WP37, `26-TARGET-DESIGN-V3.md` §6.8): the
 * same `Storage` contract the browser's IndexedDB store implements, on a
 * directory. It passes the same conformance suite (`describeStorageContract`
 * from `@craftabot/core/testing`), which is the whole point — a run the
 * harness writes is a run the Workshop can read, because both hold to one
 * contract rather than to each other.
 *
 * Layout, chosen so a person can read it and so a run is one thing to copy:
 *
 * ```
 * <root>/
 *   agents/<agentId>.json          AgentRecord
 *   runs/<runId>/run.json          RunRecord
 *   runs/<runId>/events.jsonl      one StoredEvent per line, in seq order
 *   runs/<runId>/summary.json      RunSummary, once the run has finished
 *   runs/<runId>/evaluations.jsonl one EvaluationRecord per line (WP43)
 *   campaigns/<reportId>.json     StoredCampaignReport (WP38 — the envelope, the report opaque inside)
 * ```
 *
 * Reads validate and quarantine bad rows rather than throwing (07 §1.5), as
 * the browser stores do; writes validate the shapes the store owns the schema
 * for. Nothing here is cached: every read parses the file, which is what keeps
 * "no live references" true for free and keeps the store honest about what is
 * actually on disk.
 */

export interface FileStorage extends Storage {
	readonly kind: 'file';
	readonly root: string;
	quarantined(): QuarantineReport;
}

const AGENTS = 'agents';
const RUNS = 'runs';
const GROUP_RUNS = 'group-runs';
const CAMPAIGNS = 'campaigns';

export async function createFileStorage(root: string): Promise<FileStorage> {
	const quarantine = emptyQuarantine();
	await mkdir(join(root, AGENTS), { recursive: true });
	await mkdir(join(root, RUNS), { recursive: true });
	await mkdir(join(root, GROUP_RUNS), { recursive: true });
	await mkdir(join(root, CAMPAIGNS), { recursive: true });

	const agentPath = (id: string) => join(root, AGENTS, `${id}.json`);
	const runDir = (id: string) => join(root, RUNS, id);
	const runPath = (id: string) => join(runDir(id), 'run.json');
	const eventsPath = (id: string) => join(runDir(id), 'events.jsonl');
	const summaryPath = (id: string) => join(runDir(id), 'summary.json');
	const evaluationsPath = (id: string) => join(runDir(id), 'evaluations.jsonl');
	const groupRunPath = (id: string) => join(root, GROUP_RUNS, `${id}.json`);
	const campaignPath = (id: string) => join(root, CAMPAIGNS, `${id}.json`);

	async function readJson(path: string): Promise<unknown | undefined> {
		try {
			return JSON.parse(await readFile(path, 'utf8')) as unknown;
		} catch (error) {
			if (isMissing(error)) return undefined;
			// Unreadable is a quarantine case for the caller to count, not a crash.
			return SYMBOL_CORRUPT;
		}
	}

	async function writeJson(path: string, value: unknown): Promise<void> {
		await writeFile(path, `${JSON.stringify(value, null, '\t')}\n`, 'utf8');
	}

	async function listRunIds(): Promise<string[]> {
		try {
			return (await readdir(join(root, RUNS), { withFileTypes: true }))
				.filter((entry) => entry.isDirectory())
				.map((entry) => entry.name);
		} catch (error) {
			if (isMissing(error)) return [];
			throw error;
		}
	}

	async function readRuns(): Promise<RunRecord[]> {
		const runs: RunRecord[] = [];
		for (const id of await listRunIds()) {
			const raw = await readJson(runPath(id));
			if (raw === undefined) continue; // a group's merged stream has no run.json
			if (raw === SYMBOL_CORRUPT) {
				quarantine.runs += 1;
				continue;
			}
			runs.push(raw as RunRecord);
		}
		return runs.sort(byNewestFirst);
	}

	async function readStoredEvents(runId: string): Promise<StoredEvent[]> {
		let text: string;
		try {
			text = await readFile(eventsPath(runId), 'utf8');
		} catch (error) {
			if (isMissing(error)) return [];
			throw error;
		}
		const valid: StoredEvent[] = [];
		for (const line of text.split('\n')) {
			if (line.trim() === '') continue;
			let raw: unknown;
			try {
				raw = JSON.parse(line);
			} catch {
				quarantine.events += 1;
				continue;
			}
			const parsed = safeParseStoredEvent(raw);
			if (parsed.success) valid.push(parsed.data);
			else quarantine.events += 1;
		}
		return valid.sort((a, b) => a.seq - b.seq);
	}

	async function readEvaluations(runId: string): Promise<EvaluationRecord[]> {
		let text: string;
		try {
			text = await readFile(evaluationsPath(runId), 'utf8');
		} catch (error) {
			if (isMissing(error)) return [];
			throw error;
		}
		const valid: EvaluationRecord[] = [];
		for (const line of text.split('\n')) {
			if (line.trim() === '') continue;
			try {
				const parsed = safeParseEvaluationRecord(JSON.parse(line));
				if (parsed.success) valid.push(parsed.data);
			} catch {
				// a corrupt line is skipped, as a corrupt event line is
			}
		}
		return valid;
	}

	async function removeRunDir(id: string): Promise<void> {
		await rm(runDir(id), { recursive: true, force: true });
	}

	return {
		kind: 'file',
		root,
		quarantined: () => ({ ...quarantine }),

		async listAgents() {
			let names: string[];
			try {
				names = (await readdir(join(root, AGENTS))).filter((name) => name.endsWith('.json'));
			} catch (error) {
				if (isMissing(error)) return [];
				throw error;
			}
			const valid: AgentRecord[] = [];
			for (const name of names) {
				const raw = await readJson(join(root, AGENTS, name));
				if (raw === undefined) continue;
				const migrated = raw === SYMBOL_CORRUPT ? undefined : migrateAgentRecord(raw);
				if (migrated === undefined || 'kind' in migrated) quarantine.agents += 1;
				else valid.push(migrated);
			}
			return valid;
		},
		async getAgent(id) {
			const raw = await readJson(agentPath(id));
			if (raw === undefined) return undefined;
			const migrated = raw === SYMBOL_CORRUPT ? undefined : migrateAgentRecord(raw);
			if (migrated !== undefined && !('kind' in migrated)) return migrated;
			quarantine.agents += 1;
			return undefined;
		},
		async putAgent(record) {
			const parsed = safeParseAgentRecord(record);
			if (!parsed.success) {
				quarantine.agents += 1;
				throw new Error(`Refusing to store an invalid agent: ${parsed.error.message}`);
			}
			await writeJson(agentPath(record.id), record);
		},
		async deleteAgent(id) {
			await rm(agentPath(id), { force: true });
		},

		listRuns: readRuns,
		async getRun(id) {
			const raw = await readJson(runPath(id));
			if (raw === undefined || raw === SYMBOL_CORRUPT) return undefined;
			return raw as RunRecord;
		},
		async putRun(record) {
			await mkdir(runDir(record.id), { recursive: true });
			await writeJson(runPath(record.id), record);
		},
		deleteRun: removeRunDir,
		async setRunPinned(id, pinned) {
			const raw = await readJson(runPath(id));
			if (raw === undefined || raw === SYMBOL_CORRUPT) return;
			await writeJson(runPath(id), { ...(raw as RunRecord), pinned });
		},

		async listGroupRuns() {
			let names: string[];
			try {
				names = (await readdir(join(root, GROUP_RUNS))).filter((name) => name.endsWith('.json'));
			} catch (error) {
				if (isMissing(error)) return [];
				throw error;
			}
			const rows: GroupRunRecord[] = [];
			for (const name of names) {
				const raw = await readJson(join(root, GROUP_RUNS, name));
				if (raw === undefined || raw === SYMBOL_CORRUPT) continue;
				rows.push(raw as GroupRunRecord);
			}
			return rows.sort(byNewestFirst);
		},
		async getGroupRun(id) {
			const raw = await readJson(groupRunPath(id));
			if (raw === undefined || raw === SYMBOL_CORRUPT) return undefined;
			return raw as GroupRunRecord;
		},
		async putGroupRun(record) {
			await writeJson(groupRunPath(record.id), record);
		},
		async deleteGroupRun(id) {
			await rm(groupRunPath(id), { force: true });
			await removeRunDir(id);
		},
		async setGroupRunPinned(id, pinned) {
			const raw = await readJson(groupRunPath(id));
			if (raw === undefined || raw === SYMBOL_CORRUPT) return;
			await writeJson(groupRunPath(id), { ...(raw as GroupRunRecord), pinned });
		},

		async appendEvents(runId: string, incoming: readonly EngineEvent[]) {
			if (incoming.length === 0) return;
			await mkdir(runDir(runId), { recursive: true });
			let seq = (await readStoredEvents(runId)).length;
			const lines: string[] = [];
			for (const event of incoming) {
				const stored: StoredEvent = { runId, seq, event };
				if (!safeParseStoredEvent(stored).success) {
					quarantine.events += 1;
					continue;
				}
				lines.push(JSON.stringify(stored));
				seq += 1;
			}
			if (lines.length > 0) await appendFile(eventsPath(runId), `${lines.join('\n')}\n`, 'utf8');
		},
		getEvents: readStoredEvents,
		async deleteEvents(runId) {
			await rm(eventsPath(runId), { force: true });
		},

		async putRunSummary(summary) {
			const parsed = safeParseRunSummary(summary);
			if (!parsed.success) {
				throw new Error(`Refusing to store an invalid run summary: ${parsed.error.message}`);
			}
			await mkdir(runDir(summary.runId), { recursive: true });
			await writeJson(summaryPath(summary.runId), summary);
		},
		async getRunSummary(runId) {
			const raw = await readJson(summaryPath(runId));
			if (raw === undefined || raw === SYMBOL_CORRUPT) return undefined;
			return raw as RunSummary;
		},
		async listRunSummaries() {
			const summaries: RunSummary[] = [];
			for (const id of await listRunIds()) {
				const raw = await readJson(summaryPath(id));
				if (raw === undefined || raw === SYMBOL_CORRUPT) continue;
				summaries.push(raw as RunSummary);
			}
			return summaries;
		},

		async putCampaignReport(report) {
			const parsed = safeParseStoredCampaignReport(report);
			if (!parsed.success) {
				throw new Error(`Refusing to store an invalid campaign report: ${parsed.error.message}`);
			}
			await writeJson(campaignPath(report.id), report);
		},
		async getCampaignReport(id) {
			const raw = await readJson(campaignPath(id));
			if (raw === undefined || raw === SYMBOL_CORRUPT) return undefined;
			return raw as StoredCampaignReport;
		},
		async listCampaignReports() {
			let names: string[];
			try {
				names = (await readdir(join(root, CAMPAIGNS))).filter((name) => name.endsWith('.json'));
			} catch (error) {
				if (isMissing(error)) return [];
				throw error;
			}
			const rows: StoredCampaignReport[] = [];
			for (const name of names) {
				const raw = await readJson(join(root, CAMPAIGNS, name));
				if (raw === undefined || raw === SYMBOL_CORRUPT) continue;
				rows.push(raw as StoredCampaignReport);
			}
			return rows.sort(byNewestCreated);
		},
		async deleteCampaignReport(id) {
			await rm(campaignPath(id), { force: true });
		},

		async putEvaluation(record) {
			const parsed = safeParseEvaluationRecord(record);
			if (!parsed.success) {
				throw new Error(`Refusing to store an invalid evaluation: ${parsed.error.message}`);
			}
			// The same id replaces its earlier line: rewrite rather than append.
			const kept = (await readEvaluations(record.runId)).filter((row) => row.id !== record.id);
			await mkdir(runDir(record.runId), { recursive: true });
			await writeFile(
				evaluationsPath(record.runId),
				[...kept, record].map((row) => JSON.stringify(row)).join('\n') + '\n',
				'utf8'
			);
		},
		listEvaluations: readEvaluations,
		async listAllEvaluations() {
			const all: EvaluationRecord[] = [];
			for (const id of await listRunIds()) all.push(...(await readEvaluations(id)));
			return all;
		},
		async deleteEvaluationsFor(runId) {
			await rm(evaluationsPath(runId), { force: true });
		},

		async evictOldRuns(cap = DEFAULT_RUN_CAP) {
			const doomed = selectRunsToEvict(await readRuns(), cap);
			for (const id of doomed) await removeRunDir(id);
			return doomed;
		},

		async clear() {
			for (const dir of [AGENTS, RUNS, GROUP_RUNS, CAMPAIGNS]) {
				await rm(join(root, dir), { recursive: true, force: true });
				await mkdir(join(root, dir), { recursive: true });
			}
		}
	};
}

/** A file that exists but cannot be read as JSON — distinct from one that is simply absent. */
const SYMBOL_CORRUPT: unique symbol = Symbol('corrupt');

function isMissing(error: unknown): boolean {
	return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}

/** Whether a run directory exists at all — for callers that want to say "no such run" plainly. */
export async function runExists(storage: FileStorage, runId: string): Promise<boolean> {
	try {
		return (await stat(join(storage.root, RUNS, runId))).isDirectory();
	} catch {
		return false;
	}
}
