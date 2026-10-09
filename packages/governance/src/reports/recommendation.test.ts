import { describe, expect, it } from 'vitest';
import {
	DOSSIER_MEASURES,
	decisionDossierDigest,
	parseRecommendation,
	type DecisionDossier,
	type DossierVerdict
} from '@craftabot/core';
import { recommendationFrom, renderRecommendationMarkdown } from './recommendation.js';

/**
 * **The recommendation** (plan 114 WP213): a dossier read into one of four postures by a stated rule — never more than the dossier shows.
 * A decision whose accuracy, reliability and harm are not all shown keeps a person on every decision; an unmet measure is no delegation.
 */
function dossier(
	verdicts: Partial<Record<(typeof DOSSIER_MEASURES)[number], DossierVerdict>>
): DecisionDossier {
	const measures = DOSSIER_MEASURES.map((id) => ({
		id,
		label: id,
		unit: 'rate' as const,
		threshold: { kind: 'at-least' as const, value: 0.9 },
		verdict: verdicts[id] ?? 'met',
		note: `${id} note`
	}));
	const unmet = measures.some((m) => m.verdict === 'not-met');
	const unshown = measures.some((m) => m.verdict === 'not-shown');
	const body: Omit<DecisionDossier, 'digest'> = {
		schemaVersion: 1,
		id: 'x-live@M',
		subject: 'x-live',
		decisionKind: 'a decision',
		model: 'M',
		generatedAt: '2026-10-09T00:00:00.000Z',
		measures,
		verdict: unmet ? 'not-fit' : unshown ? 'not-shown' : 'fit',
		summary: 's'
	};
	return { ...body, digest: decisionDossierDigest(body) };
}

describe('the recommendation (WP213)', () => {
	it('delegates within ceilings only when every measure is met', () => {
		expect(recommendationFrom(dossier({})).posture).toBe('delegate-within-ceilings');
	});

	it('does not delegate what a measure shows to be wrong, and names it', () => {
		const made = recommendationFrom(dossier({ accuracy: 'not-met', robustness: 'not-shown' }));
		expect(made.posture).toBe('do-not-delegate');
		expect(made.because[0]).toContain('accuracy: not met');
		expect(made.wouldShow).toHaveLength(1);
	});

	it('keeps a person on the irreversible step when the decision is shown sound and the controls round it are not', () => {
		const made = recommendationFrom(dossier({ robustness: 'not-shown', oversight: 'not-shown' }));
		expect(made.posture).toBe('delegate-with-a-person-on-the-irreversible-step');
	});

	it('keeps a person on every decision when accuracy, reliability or harm is not shown', () => {
		for (const id of ['accuracy', 'reliability', 'harm'] as const) {
			const made = recommendationFrom(dossier({ [id]: 'not-shown' }));
			expect(made.posture, id).toBe('keep-a-person-on-every-decision');
			expect(made.because.join(' ')).toContain('not all shown');
		}
	});

	it('is digested, ties itself to its dossier, and renders as a page', () => {
		const source = dossier({ accuracy: 'not-shown' });
		const made = recommendationFrom(source);
		expect(parseRecommendation(JSON.parse(JSON.stringify(made)))).toEqual(made);
		expect(made.dossier).toEqual({ id: source.id, digest: source.digest, verdict: 'not-shown' });
		expect(() => parseRecommendation({ ...made, posture: 'delegate-within-ceilings' })).toThrow(
			/digest mismatch/
		);
		const page = renderRecommendationMarkdown(made);
		expect(page).toContain('**keep-a-person-on-every-decision**');
		expect(page).toContain('never as magnitude');
	});
});
