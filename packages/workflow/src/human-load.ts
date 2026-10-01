import type {
	StageRecord,
	WorkflowAutonomyLevel,
	WorkflowRun,
	WorkflowSpec
} from '@craftabot/core';
import { CEILING_GUARDRAIL_ID } from './run.js';

/**
 * **A workflow run as a touched case** (WP80, `64-…` §6.4.1a; `68-METRICS.md`
 * §2.3): the shape `@craftabot/metrics`' human-load metrics fold — every
 * occasion a person had to act, by kind, and every decision the run took
 * with the autonomy level it was taken at. Structural, so this package
 * needs nothing of `metrics` and `metrics` nothing of this.
 *
 * A touch is a `human` stage answered (`human:<stageId>`, once, whatever
 * the answer — WP111), a stage of any other kind that escalated
 * (`escalated:<stageId>`), a stage a person returned or overturned being one
 * of those. An agent stage's approval pauses are the session's
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
	/**
	 * The reviewer model's answers (WP115, `103-…` §6), one per human stage it
	 * answered: the seconds it took, whether it was right, whether it took what
	 * the case recommended, and — when the recommendation was wrong — whether
	 * it caught it. Absent when the configuration named no reviewer.
	 */
	reviews?: Array<{
		stageId: string;
		seconds: number;
		correct: boolean;
		followed: boolean;
		/** Present only when the case recommended something wrong: true when the person answered right anyway. */
		caught?: boolean;
	}>;
}

export function touchedCaseOf(
	run: Pick<WorkflowRun, 'id' | 'stages' | 'config'>,
	decisionKindOf?: WorkflowSpec['decisionKindOf']
): TouchedCase {
	const level = run.config.autonomy?.level ?? 1;
	const touches: Touch[] = [];
	const decisions: TouchedCase['decisions'] = [];
	const reviews: NonNullable<TouchedCase['reviews']> = [];
	for (const stage of run.stages) {
		for (const kind of touchesOf(stage)) touches.push({ kind });
		const decision = decisionKindOf?.(stage.stageId, stage.output.value);
		// WP139: a decision above its ceiling that a person confirmed under the enforced ceiling was
		// taken at the ceiling, not above it — and the confirmation is that person's touch.
		const confirmed = stage.guards.verdicts?.some(
			(verdict) =>
				verdict.guardrailId === CEILING_GUARDRAIL_ID &&
				verdict.verdict === 'pause' &&
				verdict.approved === true
		);
		if (decision !== undefined) {
			const ceiling = run.config.autonomy?.ceilings?.[decision];
			decisions.push({
				kind: decision,
				level:
					confirmed && ceiling !== undefined
						? (Math.min(level, ceiling) as WorkflowAutonomyLevel)
						: level
			});
		}
		if (confirmed) touches.push({ kind: `ceiling:${stage.stageId}` });
		const by = stage.by;
		if (by) {
			const wrongPut = by.recommended !== undefined && by.recommended !== by.shouldHave;
			reviews.push({
				stageId: stage.stageId,
				seconds: by.seconds,
				correct: by.correct,
				followed: by.followed,
				...(wrongPut ? { caught: by.correct } : {})
			});
		}
	}
	return {
		id: run.id,
		touches,
		...(decisions.length > 0 ? { decisions } : {}),
		...(reviews.length > 0 ? { reviews } : {})
	};
}

export function touchesOf(stage: StageRecord): string[] {
	const kinds: string[] = [];
	// A reader stage its gate handed to a person is that person's review (WP120, `104-READERS.md` §10.4): one touch.
	const byPerson =
		stage.executor.kind === 'human' ||
		(stage.executor.kind === 'reader' &&
			stage.reader?.gated === true &&
			stage.executor.gate?.else.kind === 'human');
	if (byPerson && stage.status !== 'error') kinds.push(`human:${stage.stageId}`);
	// A person's answer is one touch whatever it was (WP111, `98-JEV.md` §9 finding 3): a
	// `human` stage answered with other than its first option is `escalated` by the
	// runtime, and counting that too counted one review twice.
	if (stage.status === 'escalated' && !byPerson) kinds.push(`escalated:${stage.stageId}`);
	if (stage.approval?.by !== undefined && !byPerson) kinds.push(`approved-by:${stage.stageId}`);
	return kinds;
}
