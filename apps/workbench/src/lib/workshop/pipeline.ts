import type { DeskRecord, StageRecord, StoredWorkflowRun, WorkflowSpec } from '@craftabot/core';
import type { InstrumentId } from '$lib/assets/instruments.js';
import type { Status } from '$lib/control-room/dataviz.js';

/**
 * **The Pipeline's folds** (WP86, `77-PIPELINE-AND-BOUNDARY.md` §4): a stage
 * record onto the Control Room's vocabulary — the executor as a roundel,
 * the status as a lamp, the stage's input and output as case-file records
 * — and a stored run onto a row of the Workflows list. Pure; the page
 * draws.
 */
export const EXECUTOR_ICON: Record<StageRecord['executor']['kind'], InstrumentId> = {
	agent: 'chain',
	rule: 'cassette',
	human: 'desk',
	line: 'deck'
};

export const EXECUTOR_WORD: Record<StageRecord['executor']['kind'], string> = {
	agent: 'the bot',
	rule: 'a rule',
	human: 'a person',
	line: 'a line'
};

export function statusOfStage(status: StageRecord['status']): Status {
	switch (status) {
		case 'ok':
			return 'pass';
		case 'escalated':
			return 'inconclusive';
		case 'blocked':
		case 'error':
			return 'fail';
	}
}

/** One stage's status as a strip glyph: the list's column. */
export function stageStrip(stages: readonly StageRecord[]): string {
	return stages
		.map((stage) =>
			stage.status === 'ok'
				? '●'
				: stage.status === 'escalated'
					? '◐'
					: stage.status === 'blocked'
						? '■'
						: '✕'
		)
		.join('');
}

/** A stage's executor as the record shows it, in a sentence. */
export function describeExecutor(executor: StageRecord['executor']): string {
	switch (executor.kind) {
		case 'agent':
			return `${EXECUTOR_WORD.agent} until ${executor.until}`;
		case 'rule':
			return `${EXECUTOR_WORD.rule}: ${executor.rule}`;
		case 'human':
			return `${EXECUTOR_WORD.human}: ${executor.options.join(' / ')}`;
		case 'line':
			return `${EXECUTOR_WORD.line}: ${executor.lineId} · ${executor.operation}`;
	}
}

/** A wall-clock instant as ISO — kept here, a plain module, since a `.svelte.ts` store may not construct a `Date` (the reactivity lint). */
export const isoAt = (ms: number): string => new Date(ms).toISOString();

type Leaf = string | number | boolean | null;

/** A stage's value flattened to dotted keys, so the case file can show it field by field. */
export function flattenValue(value: unknown, prefix = ''): Record<string, Leaf> {
	const out: Record<string, Leaf> = {};
	const visit = (node: unknown, path: string) => {
		if (node === null || node === undefined) {
			out[path || 'value'] = node === undefined ? '—' : null;
			return;
		}
		if (Array.isArray(node)) {
			if (node.length === 0) out[path || 'value'] = '[]';
			else if (node.every((entry) => typeof entry !== 'object' || entry === null))
				out[path || 'value'] = node.map((entry) => String(entry)).join(', ');
			else node.forEach((entry, index) => visit(entry, path ? `${path}.${index}` : String(index)));
			return;
		}
		if (typeof node === 'object') {
			const entries = Object.entries(node as Record<string, unknown>);
			if (entries.length === 0) out[path || 'value'] = '{}';
			for (const [key, entry] of entries) visit(entry, path ? `${path}.${key}` : key);
			return;
		}
		out[path || 'value'] = node as Leaf;
	};
	visit(value, prefix);
	return out;
}

/** The *In* or *Out* pane's records: one record per stage value, the digest beside it when the value itself was too big to keep. */
export function paneRecords(
	stage: StageRecord,
	side: 'input' | 'output',
	stageName: string
): DeskRecord[] {
	const value = stage[side];
	const fields = value.value === undefined ? { digest: value.digest } : flattenValue(value.value);
	const kept = Object.keys(fields).length > 0 ? fields : { value: '—' };
	return [
		{
			id: `${stage.stageId}-${side}`,
			kind: side === 'input' ? 'in' : 'out',
			title: side === 'input' ? `Into ${stageName}` : `Out of ${stageName}`,
			classification: 'public',
			fields: { ...kept, digest: value.digest.slice(0, 12) }
		}
	];
}

/** The stage's name from the spec when the edition ships it, else its id. */
export function stageNameOf(spec: WorkflowSpec | undefined, stageId: string): string {
	return spec?.stages.find((stage) => stage.id === stageId)?.name ?? stageId;
}

export interface WorkflowRow {
	id: string;
	workflowId: string;
	workflowName: string;
	itemId: string;
	outcome: Status;
	outcomeWord: string;
	strip: string;
	stages: number;
	touches: number;
	source: string;
	startedAt: string;
	forkedFrom?: string | undefined;
}

export function workflowRowOf(
	stored: StoredWorkflowRun,
	specs: ReadonlyMap<string, WorkflowSpec>
): WorkflowRow {
	const spec = specs.get(stored.run.workflowId);
	const touches = stored.run.stages.filter(
		(stage) => stage.executor.kind === 'human' || stage.approval !== undefined
	).length;
	return {
		id: stored.run.id,
		workflowId: stored.run.workflowId,
		workflowName: spec?.name ?? stored.run.workflowId,
		itemId: stored.run.itemId,
		outcome:
			stored.run.outcome === 'completed'
				? 'pass'
				: stored.run.outcome === 'abandoned' || stored.run.outcome === 'handed-off'
					? 'inconclusive'
					: 'fail',
		outcomeWord: stored.run.outcome,
		strip: stageStrip(stored.run.stages),
		stages: stored.run.stages.length,
		touches,
		source: stored.source
			? `${stored.source.kind}${stored.source.build ? ` · ${stored.source.build}` : ''}${stored.source.desk ? ` · ${stored.source.desk}` : ''}`
			: 'stored',
		startedAt: stored.run.startedAt,
		forkedFrom: stored.forkedFrom?.runId
	};
}

/** The choices the What-if drawer offers for a stage: the spec's default, every rule the spec has, a person, and the bot when the stage is a bot's anywhere. */
export function executorChoices(
	spec: WorkflowSpec,
	stageId: string
): Array<{ id: string; label: string; record: StageRecord['executor'] }> {
	const stage = spec.stages.find((candidate) => candidate.id === stageId);
	if (!stage) return [];
	const choices: Array<{ id: string; label: string; record: StageRecord['executor'] }> = [];
	const push = (id: string, label: string, record: StageRecord['executor']) => {
		if (!choices.some((choice) => choice.id === id)) choices.push({ id, label, record });
	};
	const asRecord = (
		executor: WorkflowSpec['stages'][number]['executor']
	): StageRecord['executor'] => {
		switch (executor.kind) {
			case 'rule':
				return { kind: 'rule', rule: executor.rule };
			case 'agent':
				return {
					kind: 'agent',
					until: executor.until,
					...(executor.maxTicks !== undefined ? { maxTicks: executor.maxTicks } : {}),
					...(executor.goalText !== undefined ? { goalText: executor.goalText } : {})
				};
			case 'human':
				return {
					kind: 'human',
					prompt: executor.prompt,
					options: [...executor.options],
					...(executor.default !== undefined ? { default: executor.default } : {})
				};
			case 'line':
				return { kind: 'line', lineId: executor.lineId, operation: executor.operation };
		}
	};
	push(
		'default',
		`the spec's default — ${describeExecutor(asRecord(stage.executor))}`,
		asRecord(stage.executor)
	);
	for (const configuration of Object.values(spec.configurations ?? {})) {
		const executor = configuration.executors?.[stageId];
		if (executor) {
			const record = asRecord(executor);
			push(`${record.kind}:${JSON.stringify(record)}`, describeExecutor(record), record);
		}
	}
	for (const ruleId of Object.keys(spec.rules ?? {})) {
		if (ruleId.startsWith(`${stageId}-`) || ruleId.startsWith(stageId)) {
			push(`rule:${ruleId}`, `a rule: ${ruleId}`, { kind: 'rule', rule: ruleId });
		}
	}
	return choices;
}
