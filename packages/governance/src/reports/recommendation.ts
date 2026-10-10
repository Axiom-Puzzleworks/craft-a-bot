import {
	recommendationDigest,
	type DecisionDossier,
	type Recommendation,
	type RecommendationPosture
} from '@craftabot/core';

/**
 * **The recommendation** (plan 114 WP213): a dossier read into one of four postures. The reading is a rule, stated here, and nothing in it
 * goes beyond the dossier:
 *
 * - every measure met → `delegate-within-ceilings`;
 * - any measure not met → `do-not-delegate`, naming them;
 * - otherwise (nothing on the wrong side, something not shown) → `delegate-with-a-person-on-the-irreversible-step` when accuracy,
 *   reliability and harm are all met — the decision is shown sound and what is missing is the proof of the controls around it — and
 *   `keep-a-person-on-every-decision` when any of the three is not shown.
 */
export function recommendationFrom(dossier: DecisionDossier, generatedAt?: string): Recommendation {
	const verdictOf = (id: string) => dossier.measures.find((measure) => measure.id === id)?.verdict;
	const unmet = dossier.measures.filter((measure) => measure.verdict === 'not-met');
	const unshown = dossier.measures.filter((measure) => measure.verdict === 'not-shown');
	const posture: RecommendationPosture =
		dossier.verdict === 'fit'
			? 'delegate-within-ceilings'
			: dossier.verdict === 'not-fit'
				? 'do-not-delegate'
				: ['accuracy', 'reliability', 'harm'].every((id) => verdictOf(id) === 'met')
					? 'delegate-with-a-person-on-the-irreversible-step'
					: 'keep-a-person-on-every-decision';
	const because =
		posture === 'delegate-within-ceilings'
			? ['Every measure clears its threshold to the end of its interval.']
			: [
					...unmet.map((measure) => `${measure.id}: not met — ${measure.note}`),
					...(posture === 'keep-a-person-on-every-decision'
						? [
								'accuracy, reliability and harm are not all shown, so no decision is shown sound enough to leave alone.'
							]
						: []),
					...unshown.map((measure) => `${measure.id}: not shown.`)
				];
	const body: Omit<Recommendation, 'digest'> = {
		schemaVersion: 1,
		id: dossier.id,
		subject: dossier.subject,
		decisionKind: dossier.decisionKind,
		model: dossier.model,
		posture,
		because,
		wouldShow: unshown.map((measure) => `${measure.id}: ${measure.note}`),
		dossier: { id: dossier.id, digest: dossier.digest, verdict: dossier.verdict },
		caveat:
			'About this synthetic bank and one sample of one model at temperature 0; the thresholds are assumptions a bank sets for itself. It transfers as method and shape, never as magnitude.',
		generatedAt: generatedAt ?? dossier.generatedAt
	};
	return { ...body, digest: recommendationDigest(body) };
}

/** The recommendation as a page a reader opens with no app. */
export function renderRecommendationMarkdown(recommendation: Recommendation): string {
	return [
		`# Recommendation — ${recommendation.subject}`,
		'',
		`> **${recommendation.posture}**`,
		'',
		`Decision: ${recommendation.decisionKind}. Model: \`${recommendation.model}\`. Rests on the dossier \`${recommendation.dossier.id}\` (${recommendation.dossier.verdict}, digest \`${recommendation.dossier.digest.slice(0, 16)}\`). Digest \`${recommendation.digest.slice(0, 16)}\`.`,
		'',
		'## Because',
		'',
		...recommendation.because.map((line) => `- ${line}`),
		'',
		'## What would move it',
		'',
		...(recommendation.wouldShow.length > 0
			? recommendation.wouldShow.map((line) => `- ${line}`)
			: ['- Nothing is outstanding.']),
		'',
		`*${recommendation.caveat}*`,
		''
	].join('\n');
}
