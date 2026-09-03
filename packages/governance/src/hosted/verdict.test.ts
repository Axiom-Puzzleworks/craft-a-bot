import { describe, expect, it } from 'vitest';
import type { GuardrailHook } from '@craftabot/core';
import { defaultHostedStrings } from './strings.js';
import { clampForHook, verdictForReading } from './verdict.js';
import { failed, finding, ok, screening } from './test-service.js';

/**
 * `25-…` §4.4's table, vendor-free (`29-…` §4.4): hook × dial × category ×
 * confidence × outcome × clamp × failure. Every row here is one every
 * vendor inherits, which is why it is tested once, here.
 */

const S = defaultHostedStrings;
const HOOKS: GuardrailHook[] = ['pre-think', 'pre-act', 'post-act'];
const matchedInjection = finding({ matched: true, confidence: 'high' });

describe('nothing fired', () => {
	it('allows with the all-clear note when the reading is ok', () => {
		expect(verdictForReading(ok(), 'pre-act', screening(), [], S)).toEqual({
			allow: true,
			note: S.allClear
		});
	});

	it.each(['partial', 'failure'] as const)(
		'treats a %s reading with nothing fired as "did not finish" — fail closed by default',
		(outcome) => {
			expect(verdictForReading(ok({ outcome }), 'pre-act', screening(), [], S)).toEqual({
				allow: false,
				reason: S.didNotFinish,
				disposition: 'stop-run'
			});
			expect(
				verdictForReading(
					ok({ outcome }),
					'pre-act',
					screening({ onFailure: 'allow-with-note' }),
					[],
					S
				)
			).toEqual({ allow: true, note: S.didNotFinish });
		}
	);
});

describe('transport failure', () => {
	it.each(['timeout', 'quota', 'unavailable', 'bad-token'] as const)(
		'%s stops the run by default, or allows with the transport note',
		(kind) => {
			expect(verdictForReading(failed(kind), 'pre-think', screening(), [], S)).toEqual({
				allow: false,
				reason: S.transport(kind),
				disposition: 'stop-run'
			});
			expect(
				verdictForReading(
					failed(kind),
					'pre-think',
					screening({ onFailure: 'allow-with-note' }),
					[],
					S
				)
			).toEqual({ allow: true, note: S.transport(kind) });
		}
	);
});

describe('the hook dial and the clamp', () => {
	it.each([
		['pre-think', 'note', { allow: true }],
		['pre-think', 'stop', { allow: false, disposition: 'stop-run' }],
		['pre-act', 'note', { allow: true }],
		['pre-act', 'block', { allow: false, disposition: 'block-action' }],
		['pre-act', 'ask', { pause: true }],
		['pre-act', 'stop', { allow: false, disposition: 'stop-run' }],
		['post-act', 'note', { allow: true }],
		['post-act', 'stop', { allow: false, disposition: 'stop-run' }]
	] as const)('%s at %s', (hook, dial, expected) => {
		const config = screening({
			screenObservation: dial as 'note' | 'stop',
			screenDecision: dial,
			screenResult: dial as 'note' | 'stop'
		});
		const verdict = verdictForReading(ok({ findings: [matchedInjection] }), hook, config, [], S);
		expect(verdict).toMatchObject(expected);
		expect('reason' in verdict ? verdict.reason : verdict.note).toBe(
			S.match([{ category: 'injection', vendorLabel: 'injection', confidence: 'high' }])
		);
	});

	it('clamps block and ask to stop off pre-act, and leaves everything else alone', () => {
		for (const hook of ['pre-think', 'post-act'] as const) {
			expect(clampForHook('block', hook)).toBe('stop');
			expect(clampForHook('ask', hook)).toBe('stop');
			expect(clampForHook('note', hook)).toBe('note');
			expect(clampForHook('off', hook)).toBe('off');
		}
		expect(clampForHook('ask', 'pre-act')).toBe('ask');
	});

	it('a per-category override wins over the hook dial, stricter or looser, and is clamped too', () => {
		const stricter = screening({ screenDecision: 'note', perCategory: { injection: 'stop' } });
		expect(
			verdictForReading(ok({ findings: [matchedInjection] }), 'pre-act', stricter, [], S)
		).toMatchObject({
			disposition: 'stop-run'
		});
		const looser = screening({ screenDecision: 'stop', perCategory: { injection: 'note' } });
		expect(
			verdictForReading(ok({ findings: [matchedInjection] }), 'pre-act', looser, [], S)
		).toMatchObject({
			allow: true
		});
		const off = screening({ screenDecision: 'stop', perCategory: { injection: 'off' } });
		expect(verdictForReading(ok({ findings: [matchedInjection] }), 'pre-act', off, [], S)).toEqual({
			allow: true,
			note: S.allClear
		});
		const askedOffPreAct = screening({
			screenObservation: 'note',
			perCategory: { injection: 'ask' }
		});
		expect(
			verdictForReading(ok({ findings: [matchedInjection] }), 'pre-think', askedOffPreAct, [], S)
		).toMatchObject({
			disposition: 'stop-run'
		});
		const inherit = screening({ screenDecision: 'block', perCategory: { injection: 'inherit' } });
		expect(
			verdictForReading(ok({ findings: [matchedInjection] }), 'pre-act', inherit, [], S)
		).toMatchObject({
			disposition: 'block-action'
		});
	});
});

describe('confidence', () => {
	it.each([
		['low', 'medium', false],
		['medium', 'medium', true],
		['high', 'medium', true],
		['medium', 'high', false],
		['low', 'low', true]
	] as const)('a %s finding against minConfidence %s counts: %s', (confidence, min, counts) => {
		const verdict = verdictForReading(
			ok({ findings: [finding({ matched: true, confidence })] }),
			'pre-act',
			screening({ minConfidence: min }),
			[],
			S
		);
		expect('pause' in verdict).toBe(counts);
	});

	it('a finding with no confidence always counts', () => {
		const verdict = verdictForReading(
			ok({ findings: [finding({ matched: true })] }),
			'pre-act',
			screening({ minConfidence: 'high' }),
			[],
			S
		);
		expect(verdict).toMatchObject({ pause: true });
	});

	it('an unmatched finding never counts, whatever its confidence', () => {
		const verdict = verdictForReading(
			ok({ findings: [finding({ matched: false, confidence: 'high' })] }),
			'pre-act',
			screening(),
			[],
			S
		);
		expect(verdict).toEqual({ allow: true, note: S.allClear });
	});
});

describe('several findings', () => {
	it('the strictest disposition wins and the reason names every fired finding', () => {
		const findings = [
			finding({
				category: 'injection',
				vendorLabel: 'injection',
				matched: true,
				confidence: 'high'
			}),
			finding({ category: 'sensitive-data', vendorLabel: 'sdp', matched: true }),
			finding({ category: 'harmful', vendorLabel: 'hate', matched: false })
		];
		const config = screening({
			screenDecision: 'note',
			perCategory: { 'sensitive-data': 'block' }
		});
		expect(verdictForReading(ok({ findings }), 'pre-act', config, [], S)).toEqual({
			allow: false,
			reason: S.match([
				{ category: 'injection', vendorLabel: 'injection', confidence: 'high' },
				{ category: 'sensitive-data', vendorLabel: 'sdp' }
			]),
			disposition: 'block-action'
		});
	});
});

describe('several findings, the other way round', () => {
	it('the strictest wins whichever comes first', () => {
		const findings = [
			finding({ category: 'injection', vendorLabel: 'injection', matched: true }),
			finding({ category: 'sensitive-data', vendorLabel: 'sdp', matched: true })
		];
		const config = screening({ screenDecision: 'note', perCategory: { injection: 'block' } });
		expect(verdictForReading(ok({ findings }), 'pre-act', config, [], S)).toMatchObject({
			disposition: 'block-action'
		});
	});
});

describe('alwaysStop', () => {
	it.each(HOOKS)(
		'a matched always-stop label stops the run at %s before any dial is read',
		(hook) => {
			const findings = [
				finding({ category: 'harmful', vendorLabel: 'csam', matched: true }),
				finding({
					category: 'injection',
					vendorLabel: 'injection',
					matched: true,
					confidence: 'high'
				})
			];
			const off = screening({
				screenObservation: 'off',
				screenDecision: 'off',
				screenResult: 'off',
				perCategory: { harmful: 'off' }
			});
			expect(verdictForReading(ok({ findings }), hook, off, ['csam'], S)).toEqual({
				allow: false,
				reason: S.match([{ category: 'harmful', vendorLabel: 'csam' }]),
				disposition: 'stop-run'
			});
		}
	);

	it('an unmatched always-stop label is nothing', () => {
		const findings = [finding({ category: 'harmful', vendorLabel: 'csam', matched: false })];
		expect(verdictForReading(ok({ findings }), 'pre-act', screening(), ['csam'], S)).toEqual({
			allow: true,
			note: S.allClear
		});
	});
});
