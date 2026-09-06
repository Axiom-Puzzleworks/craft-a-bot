import { mkdir, readdir, readFile, rm, stat, writeFile, appendFile } from 'node:fs/promises';
import { computeTraceDigest } from '@craftabot/core';
import { dirname, join } from 'node:path';
import {
	DEFAULT_RUN_CAP,
	byNewestCreated,
	byNewestFirst,
	emptyQuarantine,
	migrateAgentRecord,
	safeParseAgentRecord,
	safeParseRunSummary,
	safeParseContentRecord,
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
	type ContentRecord,
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
 *   content/<segment>/<slug>.json ContentRecord (WP46 — authored content under local/<segment>/<slug>)
 * ```
 *
 * Reads validate and quarantine bad rows rather than throwing (07 §1.5), as
 * the browser stores do; writes validate the shapes the store owns the schema
 * for. Nothing here is cached: every read parses the file, which is what keeps
 * "no live references" true for free and keeps the store honest about what is
 * actually on disk.
 */

/**
 * One line of `index.jsonl` (WP68, `57-HARNESS-AT-SCALE.md` §4.4): what a
 * listing needs to know about a run without opening its directory. The
 * last line for an id wins; a `deleted` line retires it.
 */
export interface RunIndexLine {
	id: string;
	agentId: string;
	agentName: string;
	goalCardId: string;
	outcome: string;
	/** Whether `summary.json` has been written — `listRunSummaries` opens only these. */
	summary: boolean;
	/** The events' digest, as `buildTraceFile` would stamp it, once the summary is written. */
	digest?: string;
	deleted?: true;
}

export interface FileStorage extends Storage {
	readonly kind: 'file';
	readonly root: string;
	/** The index folded (WP68): one entry per live run id, in index order. */
	readIndex(): Promise<RunIndexLine[]>;
	/** The index written again from the run directories (WP68); what `craftabot index --rebuild` calls. */
	rebuildIndex(): Promise<RunIndexLine[]>;
	quarantined(): QuarantineReport;
}

const AGENTS = 'agents';
const RUNS = 'runs';
const GROUP_RUNS = 'group-runs';
const CAMPAIGNS = 'campaigns';
const INDEX = 'index.jsonl';
const CONTENT = 'content';

/**
 * Every content record under a directory — `<segment>/<slug>.json`, the
 * harness's `content/` layout (WP46). A file that is not a record is
 * skipped, never a crash: the directory is hand-edited by design.
 */
export async function readContentDir(dir: string): Promise<ContentRecord[]> {
	let segments: string[];
	try {
		segments = await readdir(dir);
	} catch (error) {
		if (isMissing(error)) return [];
		throw error;
	}
	const rows: ContentRecord[] = [];
	for (const segment of segments) {
		let names: string[];
		try {
			names = (await readdir(join(dir, segment))).filter((name) => name.endsWith('.json'));
		} catch {
			continue;
		}
		for (const name of names) {
			let raw: unknown;
			try {
				raw = JSON.parse(await readFile(join(dir, segment, name), 'utf8'));
			} catch {
				continue;
			}
			const parsed = safeParseContentRecord(raw);
			if (parsed.success) rows.push(parsed.data);
		}
	}
	return rows;
}

export async function createFileStorage(root: string): Promise<FileStorage> {
	const quarantine = emptyQuarantine();
	await mkdir(join(root, AGENTS), { recursive: true });
	await mkdir(join(root, RUNS), { recursive: true });
	await mkdir(join(root, GROUP_RUNS), { recursive: true });
	await mkdir(join(root, CAMPAIGNS), { recursive: true });
	await mkdir(join(root, CONTENT), { recursive: true });
	const contentPath = (id: string) => join(root, CONTENT, `${id.replace(/^local\//, '')}.json`);

	const agentPath = (id: string) => join(root, AGENTS, `${id}.json`);
	const runDir = (id: string) => join(root, RUNS, id);
	const runPath = (id: string) => join(runDir(id), 'run.json');
	const eventsPath = (id: string) => join(runDir(id), 'events.jsonl');
	const summaryPath = (id: string) => join(runDir(id), 'summary.json');
	const evaluationsPath = (id: string) => join(runDir(id), 'evaluations.jsonl');
	const groupRunPath = (id: string) => join(root, GROUP_RUNS, `${id}.json`);
	const campaignPath = (id: string) => join(root, CAMPAIGNS, `${id}.json`);
	const indexPath = join(root, INDEX);

	/**
	 * The index (WP68, `57-…` §4.4), folded once per store instance and kept
	 * in step with every write: a listing reads this and opens only what it
	 * returns, never `readdir` over ten thousand directories. A store with no
	 * index — one written before, or one whose file went missing — rebuilds it
	 * from the directories on first read.
	 */
	let index: Map<string, RunIndexLine> | undefined;
	function foldIndexLines(text: string): Map<string, RunIndexLine> {
		const folded = new Map<string, RunIndexLine>();
		for (const line of text.split('\n')) {
			if (line.trim() === '') continue;
			let raw: unknown;
			try {
				raw = JSON.parse(line);
			} catch {
				continue;
			}
			const entry = raw as RunIndexLine;
			if (typeof entry?.id !== 'string') continue;
			if (entry.deleted) folded.delete(entry.id);
			else folded.set(entry.id, entry);
		}
		return folded;
	}
	async function loadIndex(): Promise<Map<string, RunIndexLine>> {
		if (index) return index;
		let text: string | undefined;
		try {
			text = await readFile(indexPath, 'utf8');
		} catch (error) {
			if (!isMissing(error)) throw error;
		}
		if (text === undefined) {
			const lines = await rebuildIndexFile();
			index = new Map(lines.map((line) => [line.id, line]));
			return index;
		}
		index = foldIndexLines(text);
		return index;
	}
	async function writeIndexLine(line: RunIndexLine): Promise<void> {
		const folded = await loadIndex();
		if (line.deleted) folded.delete(line.id);
		else folded.set(line.id, line);
		await appendFile(indexPath, `${JSON.stringify(line)}\n`, 'utf8');
	}
	async function digestOf(runId: string): Promise<string> {
		const stored = await readStoredEvents(runId);
		return computeTraceDigest(stored.map((row) => row.event));
	}
	type Listed = Pick<RunRecord, 'id' | 'agentId' | 'agentName' | 'goalCardId'> & {
		outcome: string;
	};
	function lineFor(record: Listed, summary: boolean, digest?: string): RunIndexLine {
		return {
			id: record.id,
			agentId: record.agentId,
			agentName: record.agentName,
			goalCardId: record.goalCardId,
			outcome: record.outcome,
			summary,
			...(digest !== undefined ? { digest } : {})
		};
	}
	async function rebuildIndexFile(): Promise<RunIndexLine[]> {
		const lines: RunIndexLine[] = [];
		for (const id of await listRunIds()) {
			const raw = await readJson(runPath(id));
			const summary = await readJson(summaryPath(id));
			const hasSummary = summary !== undefined && summary !== SYMBOL_CORRUPT;
			if (raw === SYMBOL_CORRUPT) continue;
			// A group's merged stream has no run.json and no summary; a summary-only directory still lists.
			if (raw === undefined && !hasSummary) continue;
			const record: Listed =
				raw === undefined
					? { id, agentId: '', agentName: '', goalCardId: '', outcome: '' }
					: (raw as RunRecord);
			lines.push(lineFor(record, hasSummary, hasSummary ? await digestOf(id) : undefined));
		}
		index = new Map(lines.map((line) => [line.id, line]));
		await writeFile(
			indexPath,
			lines.length === 0 ? '' : `${lines.map((line) => JSON.stringify(line)).join('\n')}\n`,
			'utf8'
		);
		return lines;
	}

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
		// By the index (WP68), never by `readdir`: a listing opens only what it returns.
		for (const id of [...(await loadIndex()).keys()]) {
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

	/** A run gone from disk is gone from the index too (WP68). */
	async function deleteRunAndIndex(id: string): Promise<void> {
		await removeRunDir(id);
		if ((await loadIndex()).has(id)) {
			await writeIndexLine({
				id,
				agentId: '',
				agentName: '',
				goalCardId: '',
				outcome: '',
				summary: false,
				deleted: true
			});
		}
	}

	return {
		kind: 'file',
		root,
		quarantined: () => ({ ...quarantine }),
		readIndex: async () => [...(await loadIndex()).values()],
		rebuildIndex: rebuildIndexFile,

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
			const known = (await loadIndex()).get(record.id);
			await writeIndexLine(lineFor(record, known?.summary ?? false, known?.digest));
		},
		deleteRun: deleteRunAndIndex,
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
			// The run finished (WP68): the index line gains the summary and the events' digest.
			// A summary with no run record beside it (the contract allows one) still lists.
			const raw = await readJson(runPath(summary.runId));
			const record =
				raw !== undefined && raw !== SYMBOL_CORRUPT
					? (raw as RunRecord)
					: ((await loadIndex()).get(summary.runId) ?? {
							id: summary.runId,
							agentId: '',
							agentName: '',
							goalCardId: '',
							outcome: ''
						});
			await writeIndexLine(lineFor(record, true, await digestOf(summary.runId)));
		},
		async getRunSummary(runId) {
			const raw = await readJson(summaryPath(runId));
			if (raw === undefined || raw === SYMBOL_CORRUPT) return undefined;
			return raw as RunSummary;
		},
		async listRunSummaries() {
			const summaries: RunSummary[] = [];
			// Only the runs the index says have a summary (WP68): no `readdir`, no opening of runs still going.
			const ids = [...(await loadIndex()).values()]
				.filter((line) => line.summary)
				.map((line) => line.id);
			for (const id of ids) {
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

		async putContent(record) {
			const parsed = safeParseContentRecord(record);
			if (!parsed.success) {
				throw new Error(`Refusing to store invalid content: ${parsed.error.message}`);
			}
			await mkdir(dirname(contentPath(record.id)), { recursive: true });
			await writeJson(contentPath(record.id), record);
		},
		async getContent(id) {
			const raw = await readJson(contentPath(id));
			if (raw === undefined || raw === SYMBOL_CORRUPT) return undefined;
			const parsed = safeParseContentRecord(raw);
			return parsed.success ? parsed.data : undefined;
		},
		async listContent(kind) {
			const rows = await readContentDir(join(root, CONTENT));
			return rows
				.filter((record) => kind === undefined || record.kind === kind)
				.sort((a, b) => a.id.localeCompare(b.id));
		},
		async deleteContent(id) {
			await rm(contentPath(id), { force: true });
		},

		async evictOldRuns(cap = DEFAULT_RUN_CAP) {
			const doomed = selectRunsToEvict(await readRuns(), cap);
			for (const id of doomed) await deleteRunAndIndex(id);
			return doomed;
		},

		async clear() {
			for (const dir of [AGENTS, RUNS, GROUP_RUNS, CAMPAIGNS, CONTENT]) {
				await rm(join(root, dir), { recursive: true, force: true });
				await mkdir(join(root, dir), { recursive: true });
			}
			index = undefined;
			await rm(indexPath, { force: true });
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
