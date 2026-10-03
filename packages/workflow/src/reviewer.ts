import {
	type ApprovalMeta,
	type Principal,
	type ReviewerDrew,
	calibrationRow,
	sha256Hex,
	type CalibrationRef,
	type CalibrationTable,
	type ReviewerAnswer,
	type ReviewerModel
} from '@craftabot/core';
import { seededRandom } from '@craftabot/desk';

/** A reviewer model with its rows read: the numbers a human stage draws against. */
export interface ResolvedReviewer {
	id: string;
	accuracy: number;
	automationBias: number;
	/** Seconds per case as a discrete distribution: each value with its weight. */
	seconds: Array<{ value: number; weight: number }>;
	/** P(a reason is given on an override), when the model names one (WP156). */
	reasonRate?: number;
	/** P(they say no at an approval), P(they ask a question first), P(they are late): each when the model names it (WP171). */
	refuseRate?: number;
	questionRate?: number;
	lateRate?: number;
}

interface Registry {
	getReviewerModel(id: string): ReviewerModel | undefined;
	getCalibrationTable(id: string): CalibrationTable | undefined;
}

function rowOf(registry: Registry, modelId: string, ref: CalibrationRef) {
	const table = registry.getCalibrationTable(ref.table);
	if (!table)
		throw new Error(
			`reviewer model '${modelId}': no calibration table '${ref.table}' is installed`
		);
	return calibrationRow(table, ref.row);
}

function probability(registry: Registry, modelId: string, ref: CalibrationRef): number {
	const value = rowOf(registry, modelId, ref).distribution[ref.key];
	if (value === undefined || !(value >= 0 && value <= 1))
		throw new Error(
			`reviewer model '${modelId}': ${ref.table}/${ref.row} has no probability '${ref.key}' in [0, 1]`
		);
	return value;
}

/**
 * **A reviewer model, resolved** (WP115, `103-FALLIBLE-ACTORS.md` §6): its
 * accuracy and automation bias read as probabilities from their `rates` rows,
 * its seconds per case as the `weights` row whose keys are seconds. A row the
 * registry does not hold, or a number out of range, is refused before any
 * stage is answered.
 */
export function resolveReviewer(registry: Registry, id: string): ResolvedReviewer {
	const model = registry.getReviewerModel(id);
	if (!model) throw new Error(`no reviewer model '${id}' is installed`);
	const weights = rowOf(registry, id, model.secondsPerCase).distribution;
	const seconds = Object.entries(weights)
		.map(([value, weight]) => ({ value: Number(value), weight }))
		.filter((entry) => Number.isFinite(entry.value) && entry.value >= 0 && entry.weight > 0);
	if (seconds.length === 0)
		throw new Error(
			`reviewer model '${id}': ${model.secondsPerCase.table}/${model.secondsPerCase.row} names no seconds with a weight`
		);
	return {
		id,
		accuracy: probability(registry, id, model.accuracy),
		automationBias: probability(registry, id, model.automationBias),
		seconds,
		...(model.reasonRate ? { reasonRate: probability(registry, id, model.reasonRate) } : {}),
		...(model.refuseRate ? { refuseRate: probability(registry, id, model.refuseRate) } : {}),
		...(model.questionRate ? { questionRate: probability(registry, id, model.questionRate) } : {}),
		...(model.lateRate ? { lateRate: probability(registry, id, model.lateRate) } : {})
	};
}

/**
 * What the case put in front of the person: the first string in the stage's
 * input, among its top-level fields, that is one of the options — the fraud
 * SAR's `decision`, a complaint's `decision`, a reader's answer on a review.
 * Nothing when the input carries none; then there is nothing to follow.
 */
export function recommendationIn(input: unknown, options: readonly string[]): string | undefined {
	if (!input || typeof input !== 'object') return undefined;
	for (const value of Object.values(input as Record<string, unknown>))
		if (typeof value === 'string' && options.includes(value)) return value;
	return undefined;
}

/** A stream for one stage of one run: the run's seed, the item and the stage — never the run's shared stream, so nothing else moves. */
export function reviewerRandom(seed: number, itemId: string, stageId: string, ordinal: number) {
	return seededRandom(
		Number.parseInt(sha256Hex(`${seed}|${itemId}|${stageId}|${ordinal}`).slice(0, 8), 16)
	);
}

/** The reason a modelled person gives for an override (WP156): what they chose against what was in front of them. */
export function overrideReason(answer: string, recommended: string): string {
	return `The file supports ${answer}, not the recommended ${recommended}.`;
}

/**
 * **The person's answer** (WP115, `103-…` §6; `100-…` §6.2): when the case
 * puts a wrong recommendation in front of them, they take it with the
 * automation-bias probability; otherwise they are right with the accuracy
 * probability, and wrong uniformly over the other options. The seconds are
 * drawn from the model's distribution either way. A model with accuracy 1 and
 * automation bias 0 always answers `shouldHave` — the oracle.
 */
export function reviewerAnswer(
	reviewer: ResolvedReviewer,
	options: readonly string[],
	shouldHave: string,
	recommended: string | undefined,
	random: () => number
): ReviewerAnswer {
	return reviewerAnswerDrawn(reviewer, options, shouldHave, recommended, random).answer;
}

/** What the person drew (WP160): the path that decided the answer and every roll, in order. */
export interface ReviewerDraw {
	path: 'took-recommendation' | 'accurate' | 'slipped';
	rolls: number[];
}

/**
 * `reviewerAnswer` with its draw (WP160, `112-REAL-ENOUGH-PLAN.md` §5): the
 * same answer from the same stream — `random` is only watched, never changed
 * — and the rolls behind it, so the trace can say a wrong answer was a slip
 * rather than a planted fault.
 */
export function reviewerAnswerDrawn(
	reviewer: ResolvedReviewer,
	options: readonly string[],
	shouldHave: string,
	recommended: string | undefined,
	stream: () => number
): { answer: ReviewerAnswer; draw: ReviewerDraw } {
	const rolls: number[] = [];
	const random = (): number => {
		const roll = stream();
		rolls.push(roll);
		return roll;
	};
	let path: ReviewerDraw['path'];
	let answer: string;
	if (
		recommended !== undefined &&
		recommended !== shouldHave &&
		random() < reviewer.automationBias
	) {
		answer = recommended;
		path = 'took-recommendation';
	} else if (random() < reviewer.accuracy) {
		answer = shouldHave;
		path = 'accurate';
	} else {
		path = 'slipped';
		const others = options.filter((option) => option !== shouldHave);
		answer =
			others.length === 0
				? shouldHave
				: (others[Math.floor(random() * others.length)] ?? shouldHave);
	}
	const total = reviewer.seconds.reduce((sum, entry) => sum + entry.weight, 0);
	let draw = random() * total;
	let seconds = reviewer.seconds[reviewer.seconds.length - 1]!.value;
	for (const entry of reviewer.seconds) {
		if (draw < entry.weight) {
			seconds = entry.value;
			break;
		}
		draw -= entry.weight;
	}
	// WP156: a reason on an override, drawn after everything above, so a model with no rate answers exactly as before.
	const overrode = recommended !== undefined && answer !== recommended;
	const reason =
		overrode && reviewer.reasonRate !== undefined && random() < reviewer.reasonRate
			? overrideReason(answer, recommended)
			: undefined;
	return {
		answer: {
			model: reviewer.id,
			answer,
			shouldHave,
			...(recommended !== undefined ? { recommended } : {}),
			followed: recommended !== undefined && answer === recommended,
			correct: answer === shouldHave,
			seconds,
			...(reason !== undefined ? { reason } : {})
		},
		draw: { path, rolls }
	};
}

/** The seconds a case takes them, drawn from the model's weights — one roll of `random`. */
function drawSeconds(reviewer: ResolvedReviewer, random: () => number): number {
	const total = reviewer.seconds.reduce((sum, entry) => sum + entry.weight, 0);
	let draw = random() * total;
	let seconds = reviewer.seconds[reviewer.seconds.length - 1]!.value;
	for (const entry of reviewer.seconds) {
		if (draw < entry.weight) {
			seconds = entry.value;
			break;
		}
		draw -= entry.weight;
	}
	return seconds;
}

/** The rates a reviewer carries, as `reviewer.drew` records them — only those the model names. */
export function ratesOf(reviewer: ResolvedReviewer): ReviewerDrew['rates'] {
	return {
		accuracy: reviewer.accuracy,
		automationBias: reviewer.automationBias,
		...(reviewer.reasonRate !== undefined ? { reasonRate: reviewer.reasonRate } : {}),
		...(reviewer.refuseRate !== undefined ? { refuseRate: reviewer.refuseRate } : {}),
		...(reviewer.questionRate !== undefined ? { questionRate: reviewer.questionRate } : {}),
		...(reviewer.lateRate !== undefined ? { lateRate: reviewer.lateRate } : {})
	};
}

/** What a person did at an approval: said yes, said no, or asked a question first (which, this once, is not yes). */
export interface ApprovalDraw {
	approved: boolean;
	path: 'approved' | 'refused' | 'asked';
	late: boolean;
	seconds: number;
	rolls: number[];
	/** What they said, when they did not say yes. */
	reason?: string;
}

/** What a person says when they ask first, and when they refuse — fixed words, so a trace is reproducible. */
export const ASKED_REASON = 'Before I answer: can you tell me more about why this is needed?';
export const REFUSED_REASON = 'I am not comfortable approving this.';

/**
 * **The person at an approval** (WP171, `112-REAL-ENOUGH-PLAN.md` §5): until now
 * the campaign approved every request, so *ask first* and the approval mode
 * could only be measured against a person who never says no. This person draws
 * from the model: with probability `questionRate` they ask a question first
 * (which denies this attempt, once per proposal — `alreadyAsked` skips it the
 * second time), else with probability `refuseRate` they refuse, else they
 * approve; they are late with probability `lateRate`, and the case takes the
 * seconds the model's row gives. A model naming none of the three approves
 * every time, taking the same seconds — the oracle at an approval. The seconds
 * are drawn first, then a roll for each rate the model names, in that order, so
 * adding a rate to a model appends a roll and moves none before it.
 */
export function approvalAnswerDrawn(
	reviewer: ResolvedReviewer,
	stream: () => number,
	options: { alreadyAsked?: boolean } = {}
): ApprovalDraw {
	const rolls: number[] = [];
	const random = (): number => {
		const roll = stream();
		rolls.push(roll);
		return roll;
	};
	// The seconds first, then each named rate in turn: adding a rate appends a roll and moves none before it.
	const seconds = drawSeconds(reviewer, random);
	let path: ApprovalDraw['path'] = 'approved';
	if (
		reviewer.questionRate !== undefined &&
		!options.alreadyAsked &&
		random() < reviewer.questionRate
	)
		path = 'asked';
	else if (reviewer.refuseRate !== undefined && random() < reviewer.refuseRate) path = 'refused';
	const late = reviewer.lateRate !== undefined && random() < reviewer.lateRate;
	return {
		approved: path === 'approved',
		path,
		late,
		seconds,
		rolls,
		...(path === 'asked'
			? { reason: ASKED_REASON }
			: path === 'refused'
				? { reason: REFUSED_REASON }
				: {})
	};
}

/** An approval's answer as a host hands it to `session.resolveApproval`: the answer, who gave it, and what they drew. */
export interface ApprovalAnswer {
	approved: boolean;
	by: Principal;
	meta: ApprovalMeta;
	draw: ApprovalDraw;
}

/**
 * A person as an approver (WP171): each call answers one proposal from the
 * model, and remembers which proposals it has asked about, so a question is
 * asked once and the same act, proposed again, is answered. `stream` is the
 * person's own — never a stream anything else draws from.
 */
export function createApprover(
	reviewer: ResolvedReviewer,
	stream: () => number
): (proposed: { name: string; arguments?: unknown }) => ApprovalAnswer {
	const asked = new Set<string>();
	return (proposed) => {
		const key = `${proposed.name}|${JSON.stringify(proposed.arguments ?? null)}`;
		const draw = approvalAnswerDrawn(reviewer, stream, { alreadyAsked: asked.has(key) });
		if (draw.path === 'asked') asked.add(key);
		return {
			approved: draw.approved,
			by: { kind: 'person', id: reviewer.id, name: reviewer.id },
			draw,
			meta: {
				...(draw.reason !== undefined ? { reason: draw.reason } : {}),
				drew: {
					model: reviewer.id,
					rates: ratesOf(reviewer),
					path: draw.path,
					rolls: draw.rolls,
					seconds: draw.seconds,
					...(draw.late ? { late: true as const } : {})
				}
			}
		};
	};
}

/** What else a person does at a `human` stage beyond the answer: ask a question first, and be late (WP171). */
export interface PersonAtStage {
	asked: boolean;
	late: boolean;
	/** The seconds the question added, when they asked one. */
	extraSeconds: number;
	rolls: number[];
}

/**
 * **Question and lateness at a stage** (WP171): drawn from a stream of their own
 * — never the one the answer is drawn from — and only for the rates the model
 * names, so a model naming neither answers exactly as before. Asking a question
 * re-prompts the stage once and adds the seconds a second look takes.
 */
export function personAtStage(reviewer: ResolvedReviewer, stream: () => number): PersonAtStage {
	const rolls: number[] = [];
	const random = (): number => {
		const roll = stream();
		rolls.push(roll);
		return roll;
	};
	const asked = reviewer.questionRate !== undefined && random() < reviewer.questionRate;
	const extraSeconds = asked ? drawSeconds(reviewer, random) : 0;
	const late = reviewer.lateRate !== undefined && random() < reviewer.lateRate;
	return { asked, late, extraSeconds, rolls };
}

/** Whether a model names any of the three rates WP171 added — the others behave as they did. */
export function namesPersonRates(reviewer: ResolvedReviewer): boolean {
	return (
		reviewer.refuseRate !== undefined ||
		reviewer.questionRate !== undefined ||
		reviewer.lateRate !== undefined
	);
}
