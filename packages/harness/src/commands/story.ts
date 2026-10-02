import { readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { type EvaluationRecord, type Storage, type StoredWorkflowRun } from '@craftabot/core';
import {
	renderStoryHtml,
	renderStoryMarkdown,
	scrubSecrets,
	storyForJourney,
	storyForRun,
	type JourneyAgentRun,
	type JourneyStoryInput,
	type Story
} from '@craftabot/governance/reports';

/**
 * **`craftabot story <runId | itemId>`** (WP161, `112-REAL-ENOUGH-PLAN.md`
 * §5, D12): a run, or a work item through its journey with every handoff
 * followed, told top to bottom — the same fold the Run Lab's *Read as a story*
 * and the Audit Centre's export call. A render over what the store holds,
 * redacted against every secret the process holds; nothing is written to the
 * store, and a value over a record's cap is opened from `<store>/values/`
 * when `--keep-values` kept it.
 */
export type StoryFormat = 'markdown' | 'html' | 'json';

export interface StoryOptions {
	storage: Pick<
		Storage,
		'getRun' | 'getEvents' | 'listEvaluations' | 'getWorkflowRun' | 'listWorkflowRuns'
	>;
	/** The store's directory: where `<store>/values/<digest>.json` is read from. */
	store: string;
	id: string;
	/** Follow the handoffs a journey made (the default for a journey). */
	follow?: boolean;
	secrets?: readonly string[];
}

export interface StoryReport {
	story: Story;
	kind: 'run' | 'journey';
}

/** A value kept whole by `--keep-values`, by the digest the record carries; `undefined` when none was kept. */
function valueReader(store: string): (digest: string) => unknown {
	const cache = new Map<string, unknown>();
	return (digest) => {
		if (cache.has(digest)) return cache.get(digest);
		let value: unknown;
		try {
			value = JSON.parse(readFileSync(join(store, 'values', `${digest}.json`), 'utf8')) as unknown;
		} catch {
			value = undefined;
		}
		cache.set(digest, value);
		return value;
	};
}

export async function storyOf(options: StoryOptions): Promise<StoryReport> {
	const { storage, id } = options;
	const secrets = options.secrets ?? [];
	const run = await storage.getRun(id);
	if (run) {
		const events = (await storage.getEvents(id)).map((row) => row.event);
		const story = storyForRun({
			events,
			record: run,
			evaluations: await storage.listEvaluations(id)
		});
		return { story: scrubSecrets(story, secrets), kind: 'run' };
	}

	// A journey, by its own id or its item's: the earliest run of the item is the root.
	const all = await storage.listWorkflowRuns();
	const byId = await storage.getWorkflowRun(id);
	const matches = byId
		? [byId]
		: all
				.filter((stored) => stored.run.itemId === id)
				.sort((a, b) => a.run.startedAt.localeCompare(b.run.startedAt));
	const root = matches[0];
	if (!root) throw new Error(`no run or journey '${id}' in this store`);

	const agentRunsOf = async (
		stored: StoredWorkflowRun
	): Promise<{ runs: Map<string, JourneyAgentRun>; evaluations: EvaluationRecord[] }> => {
		const runs = new Map<string, JourneyAgentRun>();
		const evaluations: EvaluationRecord[] = [];
		for (const runId of stored.run.runIds) {
			const record = await storage.getRun(runId);
			const events = (await storage.getEvents(runId)).map((row) => row.event);
			if (events.length === 0) continue;
			runs.set(runId, { events, ...(record ? { record } : {}) });
			evaluations.push(...(await storage.listEvaluations(runId)));
		}
		return { runs, evaluations };
	};
	const input = async (stored: StoredWorkflowRun): Promise<JourneyStoryInput> => {
		const { runs, evaluations } = await agentRunsOf(stored);
		return {
			run: stored.run,
			item: stored.item,
			agentRuns: runs,
			values: valueReader(options.store),
			evaluations
		};
	};

	// Each handoff followed: the run whose chain ends at the one before it.
	const followed: JourneyStoryInput[] = [];
	if (options.follow !== false) {
		let current = root;
		for (;;) {
			const next = all.find((stored) => stored.run.handoffs?.at(-1)?.runId === current.run.id);
			if (!next || followed.length >= 16) break;
			followed.push(await input(next));
			current = next;
		}
	}
	const story = storyForJourney({ ...(await input(root)), followed });
	return { story: scrubSecrets(story, secrets), kind: 'journey' };
}

/** The story in the format asked for. */
export function renderStory(story: Story, format: StoryFormat): string {
	if (format === 'html') return renderStoryHtml(story);
	if (format === 'json') return `${JSON.stringify(story, null, '\t')}\n`;
	return renderStoryMarkdown(story);
}

/** A cell's class for sampling: how its run ended, and whether an evaluator failed it. */
export function storyClassOf(cell: {
	outcome?: string | undefined;
	evaluations?: Readonly<Record<string, string>> | undefined;
}): string {
	const failed = Object.values(cell.evaluations ?? {}).includes('fail');
	return `${(cell.outcome ?? 'unfinished').toLowerCase()}-${failed ? 'failed-evaluation' : 'no-failed-evaluation'}`;
}

/**
 * **A campaign's sampled stories** (WP161): `n` cells per class — how the run
 * ended, and whether an evaluator failed it — in the report's own order, each
 * told as markdown under `<out>/stories/<class>/<runId>.md`. A gate is over a
 * slice of cells rather than one cell, so the class is the nearest thing a
 * cell has to a gate outcome; the sample is the first `n` of each, never a
 * random draw, so the same campaign samples the same cells.
 */
export async function writeCampaignStories(options: {
	storage: StoryOptions['storage'];
	store: string;
	out: string;
	cells: ReadonlyArray<{
		runId?: string | undefined;
		outcome?: string | undefined;
		evaluations?: Readonly<Record<string, string>> | undefined;
	}>;
	perClass: number;
	secrets?: readonly string[];
}): Promise<string[]> {
	const taken = new Map<string, number>();
	const written: string[] = [];
	for (const cell of options.cells) {
		if (cell.runId === undefined) continue;
		const klass = storyClassOf(cell);
		const count = taken.get(klass) ?? 0;
		if (count >= options.perClass) continue;
		taken.set(klass, count + 1);
		const report = await storyOf({
			storage: options.storage,
			store: options.store,
			id: cell.runId,
			...(options.secrets ? { secrets: options.secrets } : {})
		});
		const directory = join(options.out, 'stories', klass);
		await mkdir(directory, { recursive: true });
		const file = join(directory, `${cell.runId}.md`);
		await writeFile(file, renderStory(report.story, 'markdown'), 'utf8');
		written.push(file);
	}
	return written;
}
