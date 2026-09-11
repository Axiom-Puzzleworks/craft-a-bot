import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
	buildTraceFile,
	type AgentRecord,
	type AgentSpecV2,
	type AnyAgentSpec,
	type EngineEvent
} from '@craftabot/core';
import { toSpecV2 } from '@craftabot/core';
import { summariseRun } from '@craftabot/governance/reports';
import { runRecordFrom } from './run-record.js';
import type { FileStorage } from './storage/file-storage.js';

/**
 * **An agent run written as `run` writes one** (WP79, WP83): the agent record
 * once per bot, then per run the record, the events, the summary and the
 * redacted trace file under `<out>/runs/<runId>/`. Writes are chained, so a
 * host that hands runs over as they end can await `done()` before it writes
 * the artefact that indexes them.
 */
export interface AgentRunWriter {
	write(runId: string, spec: AnyAgentSpec, events: EngineEvent[]): Promise<void>;
	done(): Promise<void>;
}

export function createAgentRunWriter(deps: {
	storage: FileStorage;
	out: string;
	packVersions: Record<string, string>;
	secrets: string[];
	now: () => string;
}): AgentRunWriter {
	const agentsPut = new Set<string>();
	let writing: Promise<void> = Promise.resolve();
	return {
		write(runId, anySpec, events) {
			const spec: AgentSpecV2 = toSpecV2(anySpec);
			writing = writing.then(async () => {
				if (!agentsPut.has(spec.id)) {
					const agent: AgentRecord = {
						id: spec.id,
						spec,
						lastValidation: [],
						createdAt: spec.createdAt,
						updatedAt: spec.updatedAt,
						schemaVersion: 2
					};
					await deps.storage.putAgent(agent);
					agentsPut.add(spec.id);
				}
				const finished = events.find((event) => event.type === 'run.finished');
				const outcome = finished?.type === 'run.finished' ? finished.payload.outcome : undefined;
				const startedAt = events[0]?.timestamp ?? deps.now();
				const finishedAt = events.at(-1)?.timestamp ?? deps.now();
				const run = runRecordFrom({
					runId,
					spec,
					events,
					packVersions: deps.packVersions,
					startedAt,
					finishedAt,
					...(outcome ? { outcome } : {})
				});
				await deps.storage.putRun(run);
				await deps.storage.appendEvents(runId, events);
				await deps.storage.putRunSummary(summariseRun(runId, events));
				const trace = await buildTraceFile(run, events, { secrets: deps.secrets });
				await writeFile(
					join(deps.out, 'runs', runId, `${runId}.craftabot-trace.json`),
					`${JSON.stringify(trace, null, '\t')}\n`,
					'utf8'
				);
			});
			return writing;
		},
		done: () => writing
	};
}
