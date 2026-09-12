import type { StageRecord, WorkflowRun, WorkflowSpec } from '@craftabot/core';

/**
 * **A workflow run as a touched case** (WP80, `64-…` §6.4.1a; `68-METRICS.md`
 * §2.3): the shape `@craftabot/metrics`' human-load metrics fold — every
 * occasion a person had to act, by kind, and every decision the run took
 * with the autonomy level it was taken at. Structural, so this package
 * needs nothing of `metrics` and `metrics` nothing of this.
 *
 * A touch is a `human` stage answered (`human:<stageId>`), a stage that
 * escalated (`escalated:<stageId>`), a stage a person returned or overturned
 * being one of those. An agent stage's approval pauses are the session's
 * own and answered by the host — a campaign's scripted resolver — so they
 * are not a person's touch here; a stage record's `approval.by` names a
 * person when one answered, and that is a touch (`approved-by:<stageId>`).
 *
 * A decision's level is the configuration's autonomy level — the level the
 * journey ran at — and 1 (Human as Operator) for a configuration with none,
 * the control: a rule's decision is a person's policy applied.
 */
export interface Touch {
	kind: string;
}

export interface TouchedCase {
	id: string;
	touches: Touch[];
	decisions?: Array<{ kind: string; level: 1 | 2 | 3 | 4 | 5 }>;
}

export function touchedCaseOf(
	run: Pick<WorkflowRun, 'id' | 'stages' | 'config'>,
	decisionKindOf?: WorkflowSpec['decisionKindOf']
): TouchedCase {
	const level = run.config.autonomy?.level ?? 1;
	const touches: Touch[] = [];
	const decisions: TouchedCase['decisions'] = [];
	for (const stage of run.stages) {
		for (const kind of touchesOf(stage)) touches.push({ kind });
		const decision = decisionKindOf?.(stage.stageId, stage.output.value);
		if (decision !== undefined) decisions.push({ kind: decision, level });
	}
	return { id: run.id, touches, ...(decisions.length > 0 ? { decisions } : {}) };
}

export function touchesOf(stage: StageRecord): string[] {
	const kinds: string[] = [];
	if (stage.executor.kind === 'human' && stage.status !== 'error')
		kinds.push(`human:${stage.stageId}`);
	if (stage.status === 'escalated') kinds.push(`escalated:${stage.stageId}`);
	if (stage.approval?.by !== undefined && stage.executor.kind !== 'human')
		kinds.push(`approved-by:${stage.stageId}`);
	return kinds;
}
