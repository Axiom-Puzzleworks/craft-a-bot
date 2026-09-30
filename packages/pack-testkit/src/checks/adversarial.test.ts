import { adversarialLabels, corpusDigest, type Corpus, type CorpusRow } from '@craftabot/core';
import { describe, expect, it } from 'vitest';
import { adversarialProfile, checkAdversarialCorpus } from './adversarial.js';

/** `checkAdversarialCorpus` (WP122, `106-BENCHMARK.md` §5): a green corpus, a red one per refusal, the profile. */
const row = (id: string, surface: string, attack: string, target: string): CorpusRow => ({
	id,
	state: { surface, text: `a row by ${surface}` },
	tags: [],
	labels: { attack, target }
});
const green = [
	row('a1', 'caller', 'steer', 'the-label'),
	row('a2', 'caller', 'none', 'none'),
	row('a3', 'document', 'injection', 'the-tool'),
	row('a4', 'document', 'none', 'none')
];
const corpus = (rows: CorpusRow[] = green, over: Partial<Corpus> = {}): Corpus => {
	const labels = over.labels ?? adversarialLabels();
	return {
		id: 'test/corpus/adversarial',
		name: 'Adversarial',
		version: '1',
		stateKind: 'attack-surface',
		guide: 'Synthetic.',
		annotators: [{ id: 'author', blind: false, primary: true }],
		heldOut: false,
		seenBy: [],
		...over,
		labels,
		rows,
		digest: corpusDigest({ labels, rows })
	};
};
const surfaces = ['caller', 'document'] as const;
const checks = (
	value: Corpus,
	declared: readonly ('caller' | 'document' | 'tool-result')[] = surfaces
) => checkAdversarialCorpus(value, { surfaces: declared }).map((issue) => issue.check);

describe('checkAdversarialCorpus (WP122)', () => {
	it('passes a corpus over its declared surfaces with both kinds of row on each', () => {
		expect(checks(corpus())).toEqual([]);
	});

	it('refuses another state kind, and label sets other than the shared ones', () => {
		expect(checks(corpus(green, { stateKind: 'words' }))).toEqual(['adversarial.state-kind']);
		const labels = adversarialLabels();
		labels.attack = { ...labels.attack!, guide: 'A shorter guide.' };
		expect(checks(corpus(green, { labels }))).toEqual(['adversarial.labels']);
	});

	it('refuses a state that is not { surface, text }, and a surface the desk has not', () => {
		expect(checks(corpus([...green, { ...green[1]!, id: 'a5', state: 'bare words' }]))).toEqual([
			'adversarial.state'
		]);
		expect(checks(corpus([...green, row('a5', 'counterpart', 'none', 'none')]))).toEqual([
			'adversarial.state'
		]);
	});

	it('refuses a benign row with a target, and an attack with none', () => {
		expect(checks(corpus([...green, row('a5', 'caller', 'none', 'the-label')]))).toEqual([
			'adversarial.benign'
		]);
		expect(checks(corpus([...green, row('a5', 'caller', 'steer', 'none')]))).toEqual([
			'adversarial.benign'
		]);
	});

	it('refuses a declared surface without both an attack and a benign row', () => {
		expect(checks(corpus(), ['caller', 'document', 'tool-result'])).toEqual([
			'adversarial.surfaces'
		]);
		expect(checks(corpus(green.filter((each) => each.id !== 'a4')))).toEqual([
			'adversarial.surfaces'
		]);
	});

	it('refuses a corpus less than a quarter benign, and profiles what it holds', () => {
		const attacks = ['b1', 'b2', 'b3', 'b4', 'b5'].map((id) =>
			row(id, 'caller', 'jailbreak', 'the-tool')
		);
		expect(checks(corpus([...green, ...attacks]))).toEqual(['adversarial.benign-share']);
		expect(adversarialProfile(corpus())).toEqual({
			rows: 4,
			benign: 2,
			benignShare: 0.5,
			byAttack: { none: 2, steer: 1, injection: 1, jailbreak: 0, exfiltration: 0, elicitation: 0 },
			byTarget: { none: 2, 'the-label': 1, 'the-tool': 1, 'the-secret': 0, 'the-person': 0 },
			bySurface: { caller: { steer: 1, none: 1 }, document: { injection: 1, none: 1 } }
		});
	});
});
