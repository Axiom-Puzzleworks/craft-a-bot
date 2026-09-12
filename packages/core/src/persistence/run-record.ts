import type { AgentSpecV2 } from '../schemas/agent-spec-v2.js';
import type { EngineEvent } from '../schemas/events.js';
import type { RunRecord } from '../schemas/trace-file.js';
import type { RunOutcome } from '../schemas/shared.js';
import {
	DEFAULT_REQUEST_TIMEOUT_MS,
	DEFAULT_TICK_BUDGET,
	DEFAULT_TOKEN_BUDGET
} from '../session/budgets.js';

/**
 * A `RunRecord` read back out of the run's own trace — the same derivation
 * the Kit's Play route makes (`routes/play/[agentId]/+page.svelte`,
 * `toRunRecord`): mode, budgets, provider and wire model come from
 * `run.started`, never from what the caller thinks it asked for, so the
 * record and the trace cannot disagree (hard rule 3). Ticks and usage are
 * folded from the events for the same reason. Moved here from the harness
 * (WP84, `75-THE-MONITOR.md` §6) so the evidence sink can bundle an agent
 * run the same way `craftabot run` records one.
 */
export function runRecordFrom(input: {
	runId: string;
	spec: AgentSpecV2;
	events: readonly EngineEvent[];
	packVersions: Record<string, string>;
	startedAt: string;
	finishedAt?: string;
	outcome?: RunOutcome;
	pinned?: boolean;
}): RunRecord {
	const started = input.events.find((event) => event.type === 'run.started');
	const facts = started?.type === 'run.started' ? started.payload : undefined;

	let ticks = 0;
	const usage = { inputTokens: 0, outputTokens: 0 };
	for (const event of input.events) {
		if (event.tick > ticks) ticks = event.tick;
		if (event.type === 'think.completed') {
			usage.inputTokens += event.payload.response.usage.inputTokens;
			usage.outputTokens += event.payload.response.usage.outputTokens;
		}
	}

	return {
		id: input.runId,
		agentId: input.spec.id,
		agentName: input.spec.name,
		goalCardId: input.spec.goalCardId,
		specSnapshot: input.spec,
		packVersions: input.packVersions,
		mode: facts?.mode ?? 'step',
		outcome: input.outcome ?? 'IN_PROGRESS',
		ticks,
		usage,
		budgets: facts?.budgets ?? {
			maxTicks: DEFAULT_TICK_BUDGET,
			maxTokens: DEFAULT_TOKEN_BUDGET,
			requestTimeoutMs: DEFAULT_REQUEST_TIMEOUT_MS
		},
		providerId: facts?.providerId ?? 'unrecorded',
		wireModel: facts?.wireModel ?? 'unrecorded',
		pinned: input.pinned ?? false,
		startedAt: input.startedAt,
		...(input.finishedAt !== undefined ? { finishedAt: input.finishedAt } : {}),
		schemaVersion: 2
	};
}
