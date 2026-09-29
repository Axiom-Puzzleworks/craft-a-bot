import {
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
		seconds
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
	let answer: string;
	if (
		recommended !== undefined &&
		recommended !== shouldHave &&
		random() < reviewer.automationBias
	) {
		answer = recommended;
	} else if (random() < reviewer.accuracy) {
		answer = shouldHave;
	} else {
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
	return {
		model: reviewer.id,
		answer,
		shouldHave,
		...(recommended !== undefined ? { recommended } : {}),
		followed: recommended !== undefined && answer === recommended,
		correct: answer === shouldHave,
		seconds
	};
}
