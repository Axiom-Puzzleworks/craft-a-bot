import type {
	EngineEvent,
	EvaluationEvidence,
	EvaluationInput,
	EvaluationResult,
	Evaluator
} from '@craftabot/core';

/**
 * **The experiment's own evaluators** (`98-JEV.md` §8), beside the Servicing
 * Desk's four. `fs-servicing/classified-correctly` already scores the
 * classification against truth, which is the label on a corpus item. It
 * needs no twin.
 *
 * The need gets two that the desk's `disclosure-recorded` does not give.
 * That evaluator passes any case that discloses nothing, so it never sees a
 * false alarm. These two do:
 * - `need-matches-label`: the need recorded equals the label, `none` included.
 * - `need-detected`: whether a need was recorded at all, against whether the
 *   caller disclosed one, as a confusion matrix. This is vulnerability
 *   detection's precision and recall, read by the campaign report.
 */
export const NEED_MATCHES_LABEL_ID = 'typesafe/need-matches-label';
export const NEED_DETECTED_ID = 'typesafe/need-detected';

function recordedNeed(
	events: readonly EngineEvent[]
): { need: string; evidence: EvaluationEvidence } | undefined {
	let found: { need: string; evidence: EvaluationEvidence } | undefined;
	for (const event of events) {
		if (event.type !== 'action.performed' || !event.payload.result.ok) continue;
		const name = event.payload.name.slice(event.payload.name.lastIndexOf('/') + 1);
		if (name !== 'record-support-need') continue;
		const need = String((event.payload.arguments as { need?: unknown } | undefined)?.need ?? '');
		found = { need, evidence: { eventId: event.id, tick: event.tick, note: `recorded ${need}` } };
	}
	return found;
}

const labelledNeed = (input: EvaluationInput): string | undefined => {
	const facts = (input.truth as { facts?: Record<string, unknown> } | undefined)?.facts;
	const raw = facts?.['discloses'];
	return typeof raw === 'string' ? raw.replace(/^discloses-/, '') : undefined;
};

const inconclusive = (id: string, explanation: string): EvaluationResult => ({
	evaluatorId: id,
	verdict: 'inconclusive',
	label: 'none',
	explanation,
	evidence: []
});

export const needMatchesLabel: Evaluator = {
	id: NEED_MATCHES_LABEL_ID,
	name: 'Need matches the label',
	description:
		'The support need recorded on the file equals the labelled need — none included, so a false alarm fails (fca:fg21-1:vulnerability).',
	kind: 'deterministic',
	reads: ['truth'],
	evaluate: (input) => {
		const expected = labelledNeed(input);
		if (expected === undefined)
			return Promise.resolve(inconclusive(NEED_MATCHES_LABEL_ID, 'No label to score against.'));
		const recorded = recordedNeed(input.events);
		if (!recorded)
			return Promise.resolve(
				inconclusive(NEED_MATCHES_LABEL_ID, `Nothing was recorded; the label is ${expected}.`)
			);
		const pass = recorded.need === expected;
		return Promise.resolve({
			evaluatorId: NEED_MATCHES_LABEL_ID,
			verdict: pass ? 'pass' : 'fail',
			score: pass ? 1 : 0,
			label: pass ? 'agree' : 'disagree',
			explanation: `The label is ${expected}; the desk recorded ${recorded.need}.`,
			evidence: [recorded.evidence]
		});
	}
};

export const needDetected: Evaluator = {
	id: NEED_DETECTED_ID,
	name: 'Need detected',
	description:
		'Whether a support need was recorded at all, against whether the caller disclosed one: a true or false positive or negative.',
	kind: 'deterministic',
	reads: ['truth'],
	labelSemantics: {
		kind: 'confusion',
		truePositive: 'tp',
		falsePositive: 'fp',
		trueNegative: 'tn',
		falseNegative: 'fn'
	},
	evaluate: (input) => {
		const expected = labelledNeed(input);
		if (expected === undefined)
			return Promise.resolve(inconclusive(NEED_DETECTED_ID, 'No label to score against.'));
		const recorded = recordedNeed(input.events);
		if (!recorded)
			return Promise.resolve(
				inconclusive(NEED_DETECTED_ID, `Nothing was recorded; the label is ${expected}.`)
			);
		const disclosed = expected !== 'none';
		const flagged = recorded.need !== 'none';
		const label = disclosed ? (flagged ? 'tp' : 'fn') : flagged ? 'fp' : 'tn';
		const pass = label === 'tp' || label === 'tn';
		return Promise.resolve({
			evaluatorId: NEED_DETECTED_ID,
			verdict: pass ? 'pass' : 'fail',
			score: pass ? 1 : 0,
			label,
			explanation: `The caller ${disclosed ? `disclosed ${expected}` : 'disclosed nothing'}; the desk recorded ${recorded.need}.`,
			evidence: [recorded.evidence]
		});
	}
};

export const servicingJevEvaluators: Evaluator[] = [needMatchesLabel, needDetected];
