import {
	agreementDrift,
	fairnessDrift,
	ksDrift,
	outcomeMixDistance,
	pageHinkley,
	psiCategorical,
	psiNumeric
} from '../drift.js';
import {
	conditionalParity,
	counterfactualFlip,
	demographicParity,
	disparateImpact,
	equalOpportunity,
	equalisedOdds,
	matchedPairDiscordance,
	predictiveParity,
	ruleAgreement,
	type DecidedCase
} from '../fairness.js';
import { ceilingBreachRate, touchesPerCase, unattendedRate } from '../human-load.js';
import { wilson } from '../intervals.js';
import {
	decidedCases,
	decisions,
	feature,
	featureWithMovedDecile,
	flips,
	matchedPairs,
	series,
	touchedCases
} from './generators.js';

/**
 * **The validation suite as data** (WP76, `68-METRICS.md` §4): for every
 * metric, the hand case, the planted effect and the null, run the same
 * way by the tests and by `scripts/metrics-doc.mjs`, so `docs/metrics.md`
 * shows what the tests saw and nothing else. Deterministic: seeds 1…S.
 */
export interface ValidationRow {
	family: 'fairness' | 'drift' | 'human load';
	metric: string;
	definition: string;
	interval: string;
	test: string;
	hand: { expected: number; got: number; ok: boolean };
	planted: {
		planted: number;
		recovered: number;
		tolerance: number;
		/** For a value with an interval: the interval contains the planted size. */
		contained?: boolean | undefined;
		ok: boolean;
	};
	null: {
		/** What a false alarm is, for this metric. */
		alarm: string;
		rate: number;
		bound: number;
		ok: boolean;
	};
}

export interface ValidationReport {
	seeds: number;
	n: number;
	/** The null bound: 5% plus the Wilson margin at this many seeds. */
	bound: number;
	rows: ValidationRow[];
}

const round = (value: number, places = 4): number => Number(value.toFixed(places));

/** §3.2's twenty rows: group a 7 of 10 approved, group b 4 of 10; twelve repaid — a 6 (5 approved), b 6 (3 approved). */
export function handCases(): DecidedCase[] {
	const rows: DecidedCase[] = [];
	const push = (
		group: string,
		approve: number,
		total: number,
		repaidApproved: number,
		repaidTotal: number
	) => {
		for (let i = 0; i < total; i += 1) {
			const decision = i < approve ? 'approve' : 'decline';
			// The first `repaidTotal` cases are the repaid ones; among them the first `repaidApproved` were approved.
			const repaid =
				i < repaidApproved
					? true
					: i < approve
						? false
						: i - approve < repaidTotal - repaidApproved;
			rows.push({
				group,
				decision,
				repaid,
				verdict: i % 5 === 0 ? (decision === 'approve' ? 'decline' : 'approve') : decision,
				stratum: i % 2 === 0 ? 's1' : 's2'
			});
		}
	};
	push('a', 7, 10, 5, 6);
	push('b', 4, 10, 3, 6);
	return rows;
}

export function validationReport(options: { seeds?: number; n?: number } = {}): ValidationReport {
	const seeds = options.seeds ?? 200;
	const n = options.n ?? 2000;
	// A 5% false-alarm rate, seen over `seeds` trials, sits under this with 95% confidence.
	const bound = round(wilson(Math.round(0.05 * seeds), seeds)[1], 4);
	const rows: ValidationRow[] = [];
	const nullRate = (alarm: (seed: number) => boolean) => {
		let alarms = 0;
		for (let seed = 1; seed <= seeds; seed += 1) if (alarm(seed)) alarms += 1;
		return round(alarms / seeds, 4);
	};
	const excludesZero = (interval: [number, number]) => interval[0] > 0 || interval[1] < 0;
	const hand = handCases();

	const fairnessRow = (
		metric: string,
		definition: string,
		interval: string,
		test: string,
		handExpected: number,
		handGot: number,
		planted: number,
		recoveredResult: { value: number; interval: [number, number] },
		tolerance: number,
		alarm: (seed: number) => boolean,
		alarmText = 'the 95% interval excludes 0'
	): ValidationRow => {
		const rate = nullRate(alarm);
		const contained =
			recoveredResult.interval[0] <= planted && planted <= recoveredResult.interval[1];
		return {
			family: 'fairness',
			metric,
			definition,
			interval,
			test,
			hand: {
				expected: round(handExpected),
				got: round(handGot),
				ok: Math.abs(handExpected - handGot) < 1e-4
			},
			planted: {
				planted,
				recovered: round(recoveredResult.value),
				tolerance,
				contained,
				ok: Math.abs(recoveredResult.value - planted) <= tolerance && contained
			},
			null: { alarm: alarmText, rate, bound, ok: rate <= bound }
		};
	};

	const nullShape = { approve: { a: 0.5, b: 0.5 } };

	// demographic parity: planted 0.06
	rows.push(
		fairnessRow(
			'demographic-parity',
			'max − min over groups of P(approve | group)',
			'Newcombe hybrid score',
			'two-proportion z (Fisher exact under the floor)',
			0.3,
			demographicParity(hand).value,
			0.06,
			demographicParity(decidedCases(1, 2 * n, { approve: { a: 0.56, b: 0.5 } })),
			0.02,
			(seed) => excludesZero(demographicParity(decidedCases(seed, n, nullShape)).interval)
		)
	);
	// disparate impact: planted 0.8
	{
		const planted = disparateImpact(decidedCases(2, 2 * n, { approve: { a: 0.5, b: 0.4 } }));
		rows.push(
			fairnessRow(
				'disparate-impact',
				'min / max over groups of P(approve | group); the four-fifths rule is a convention',
				'log-ratio',
				'two-proportion z (Fisher exact under the floor)',
				4 / 7,
				disparateImpact(hand).value,
				0.8,
				planted,
				0.05,
				(seed) => {
					const r = disparateImpact(decidedCases(seed, n, nullShape)).interval;
					return r[0] > 1 || r[1] < 1;
				},
				'the 95% interval excludes 1'
			)
		);
	}
	// equal opportunity: a 6-point gap among the repaid only
	rows.push(
		fairnessRow(
			'equal-opportunity',
			'max − min of P(approve | repaid, group)',
			'Newcombe hybrid score',
			'two-proportion z (Fisher exact under the floor)',
			5 / 6 - 3 / 6,
			equalOpportunity(hand).value,
			0.06,
			equalOpportunity(
				decidedCases(3, 2 * n, {
					approve: { a: 0.5, b: 0.5 },
					approveGiven: (group, repaid) => (repaid ? (group === 'a' ? 0.56 : 0.5) : 0.3)
				})
			),
			0.02,
			(seed) =>
				excludesZero(
					equalOpportunity(
						decidedCases(seed, n, {
							approve: { a: 0.5, b: 0.5 },
							approveGiven: (_g, repaid) => (repaid ? 0.5 : 0.3)
						})
					).interval
				)
		)
	);
	// equalised odds: a 6-point false-positive gap only
	{
		const planted = equalisedOdds(
			decidedCases(4, 2 * n, {
				approve: { a: 0.5, b: 0.5 },
				repaid: 0.5,
				approveGiven: (group, repaid) => (repaid ? 0.5 : group === 'a' ? 0.36 : 0.3)
			})
		);
		const handGot = equalisedOdds(hand);
		rows.push(
			fairnessRow(
				'equalised-odds',
				'the larger of the equal-opportunity difference and the false-positive-rate difference',
				'Newcombe hybrid score on the larger component',
				'two-proportion z (Fisher exact under the floor)',
				handGot.value,
				handGot.value,
				0.06,
				planted,
				0.02,
				(seed) =>
					excludesZero(
						equalisedOdds(
							decidedCases(seed, n, {
								approve: { a: 0.5, b: 0.5 },
								repaid: 0.5,
								approveGiven: (_g, repaid) => (repaid ? 0.5 : 0.3)
							})
						).interval
					)
			)
		);
	}
	// predictive parity: a 6-point repayment gap among the approved
	rows.push(
		fairnessRow(
			'predictive-parity',
			'max − min of P(repaid | approved, group)',
			'Newcombe hybrid score',
			'two-proportion z (Fisher exact under the floor)',
			3 / 4 - 5 / 7,
			predictiveParity(hand).value,
			0.06,
			predictiveParity(
				decidedCases(5, 2 * n, {
					approve: { a: 0.5, b: 0.5 },
					repaidGiven: (group, approved) => (approved ? (group === 'a' ? 0.86 : 0.8) : 0.5)
				})
			),
			0.02,
			(seed) =>
				excludesZero(
					predictiveParity(
						decidedCases(seed, n, {
							approve: { a: 0.5, b: 0.5 },
							repaidGiven: (_g, approved) => (approved ? 0.8 : 0.5)
						})
					).interval
				)
		)
	);
	// conditional parity: a 6-point gap inside each stratum, strata of different sizes
	{
		const strata = { s1: 5, s2: 3, s3: 2 };
		const strataShift = { s1: 0, s2: 0.15, s3: -0.15 };
		rows.push(
			fairnessRow(
				'conditional-parity',
				'demographic parity within strata of a legitimate factor, pooled by stratum share',
				'the strata’s Newcombe bounds summed by weight (conservative)',
				'none',
				conditionalParity(hand).value,
				conditionalParity(hand).value,
				0.06,
				conditionalParity(
					decidedCases(6, 2 * n, { approve: { a: 0.56, b: 0.5 }, strata, strataShift })
				),
				0.02,
				(seed) =>
					excludesZero(
						conditionalParity(
							decidedCases(seed, n, { approve: { a: 0.5, b: 0.5 }, strata, strataShift })
						).interval
					)
			)
		);
	}
	// rule agreement: planted 0.06
	rows.push(
		fairnessRow(
			'rule-agreement',
			'max − min of P(decision = verdict | group)',
			'Newcombe hybrid score',
			'two-proportion z (Fisher exact under the floor)',
			0,
			ruleAgreement(hand).value,
			0.06,
			ruleAgreement(
				decidedCases(7, 2 * n, { approve: { a: 0.5, b: 0.5 }, agreement: { a: 0.9, b: 0.84 } })
			),
			0.02,
			(seed) =>
				excludesZero(
					ruleAgreement(
						decidedCases(seed, n, { approve: { a: 0.5, b: 0.5 }, agreement: { a: 0.9, b: 0.9 } })
					).interval
				)
		)
	);
	// discordance: 8% of 1,000 pairs, all favouring a
	{
		const handPairs: DecidedCase[] = [];
		for (let i = 0; i < 10; i += 1) {
			const differ = i < 3;
			handPairs.push(
				{
					group: 'a',
					decision: differ ? (i < 2 ? 'approve' : 'decline') : 'approve',
					pairId: `h${i}`
				},
				{
					group: 'b',
					decision: differ ? (i < 2 ? 'decline' : 'approve') : 'approve',
					pairId: `h${i}`
				}
			);
		}
		const planted = matchedPairDiscordance(matchedPairs(8, 1000, 0.08));
		const row = fairnessRow(
			'discordance',
			'the share of matched pairs decided differently',
			'Clopper–Pearson exact',
			'the sign test on the direction',
			0.3,
			matchedPairDiscordance(handPairs).value,
			0.08,
			planted,
			0.02,
			(seed) => (matchedPairDiscordance(matchedPairs(seed, 500, 0)).p ?? 1) < 0.05,
			'the sign test p < 0.05 with no discordant pairs'
		);
		// The planted direction is one-sided, so the sign test must see it.
		row.planted.ok = row.planted.ok && (planted.p ?? 1) < 0.05;
		rows.push(row);
	}
	// counterfactual flip: 5%
	rows.push(
		fairnessRow(
			'counterfactual-flip',
			'the share of forks whose decision changed when the cohort was flipped',
			'Clopper–Pearson exact',
			'none',
			0.2,
			counterfactualFlip([
				{ original: 'approve', flipped: 'decline' },
				{ original: 'approve', flipped: 'approve' },
				{ original: 'decline', flipped: 'decline' },
				{ original: 'decline', flipped: 'decline' },
				{ original: 'approve', flipped: 'approve' }
			]).value,
			0.05,
			counterfactualFlip(flips(9, 2 * n, 0.05)),
			0.01,
			(seed) => excludesZero(counterfactualFlip(flips(seed, n, 0)).interval),
			'the 95% interval excludes 0 with no flips'
		)
	);

	// --- drift
	const driftRow = (
		metric: string,
		definition: string,
		interval: string,
		test: string,
		handExpected: number,
		handGot: number,
		planted: number,
		recovered: number,
		tolerance: number,
		plantedOk: boolean,
		alarm: (seed: number) => boolean,
		alarmText: string
	): ValidationRow => {
		const rate = nullRate(alarm);
		return {
			family: 'drift',
			metric,
			definition,
			interval,
			test,
			hand: {
				expected: round(handExpected),
				got: round(handGot),
				ok: Math.abs(handExpected - handGot) < 1e-4
			},
			planted: { planted, recovered: round(recovered), tolerance, ok: plantedOk },
			null: { alarm: alarmText, rate, bound, ok: rate <= bound }
		};
	};
	{
		const handPsi =
			(0.4 - 0.5) * Math.log(0.4 / 0.5) +
			(0.3 - 0.3) * Math.log(1) +
			(0.3 - 0.2) * Math.log(0.3 / 0.2);
		const got = psiCategorical(
			['a', 'a', 'a', 'a', 'a', 'b', 'b', 'b', 'c', 'c'],
			['a', 'a', 'a', 'a', 'b', 'b', 'b', 'c', 'c', 'c']
		);
		const planted = psiNumeric(feature(1, n), featureWithMovedDecile(2, n)).value;
		rows.push(
			driftRow(
				'psi',
				'Σ (c − r) ln(c / r) over bins fixed from the reference (deciles for a number, categories for a string)',
				'none; stable < 0.10, watch ≤ 0.25, act above (a convention)',
				'none',
				handPsi,
				got.value,
				0.176,
				planted,
				0.04,
				Math.abs(planted - 0.176) <= 0.04,
				(seed) => psiNumeric(feature(seed, n), feature(seed + 1000, n)).reading !== 'stable',
				'a reading other than stable'
			)
		);
	}
	{
		const planted = ksDrift(feature(1, n), feature(2, n, 0.3));
		rows.push(
			driftRow(
				'ks',
				'max |F_reference − F_current| with the asymptotic p',
				'none',
				'Kolmogorov–Smirnov two-sample',
				0.5,
				ksDrift([1, 2, 3, 4], [3, 4, 5, 6]).value,
				0.12,
				planted.value,
				0.04,
				planted.p < 0.01,
				(seed) => ksDrift(feature(seed, n), feature(seed + 1000, n)).p < 0.05,
				'p < 0.05'
			)
		);
	}
	{
		const planted = outcomeMixDistance(decisions(1, n, 0.5), decisions(2, n, 0.7)).value;
		rows.push(
			driftRow(
				'outcome-mix',
				'½ Σ |p − q| over the outcome shares',
				'none',
				'none',
				0.4,
				outcomeMixDistance(
					['a', 'a', 'a', 'a', 'a', 'a', 'b', 'b', 'b', 'b'],
					['a', 'a', 'b', 'b', 'b', 'b', 'b', 'b', 'b', 'b']
				).value,
				0.2,
				planted,
				0.03,
				Math.abs(planted - 0.2) <= 0.03,
				(seed) =>
					outcomeMixDistance(decisions(seed, n, 0.5), decisions(seed + 1000, n, 0.5)).value > 0.1,
				'a distance above 0.1'
			)
		);
	}
	{
		const reference = decidedCases(1, n, {
			approve: { a: 0.5, b: 0.5 },
			agreement: { a: 0.9, b: 0.9 }
		});
		const current = decidedCases(2, n, {
			approve: { a: 0.5, b: 0.5 },
			agreement: { a: 0.84, b: 0.84 }
		});
		const planted = agreementDrift(reference, current);
		rows.push(
			driftRow(
				'agreement',
				'P(decision = verdict) in the current set minus the reference set',
				'Newcombe hybrid score',
				'none',
				0.6,
				agreementDrift(
					hand.map((c, i) => ({
						...c,
						verdict: i % 5 === 0 ? c.decision : c.decision === 'approve' ? 'decline' : 'approve'
					})),
					hand
				).value,
				-0.06,
				planted.value,
				0.02,
				Math.abs(planted.value + 0.06) <= 0.02 &&
					planted.interval[0] <= -0.06 &&
					-0.06 <= planted.interval[1],
				(seed) =>
					excludesZero(
						agreementDrift(
							decidedCases(seed, n, { approve: { a: 0.5, b: 0.5 } }),
							decidedCases(seed + 1000, n, { approve: { a: 0.5, b: 0.5 } })
						).interval
					),
				'the 95% interval excludes 0'
			)
		);
	}
	{
		const planted = fairnessDrift(
			'demographic-parity',
			decidedCases(1, 2 * n, { approve: { a: 0.5, b: 0.5 } }),
			decidedCases(2, 2 * n, { approve: { a: 0.56, b: 0.5 } })
		);
		rows.push(
			driftRow(
				'fairness',
				'a fairness metric in the current set minus the reference set (a max − min metric’s null sits above 0 by the sampling gap, so a drift understates by it)',
				'the two half-widths combined in quadrature',
				'none',
				0,
				fairnessDrift('demographic-parity', hand, hand).value,
				0.06,
				planted.value,
				0.04,
				Math.abs(planted.value - 0.06) <= 0.04 &&
					planted.interval[0] <= 0.06 &&
					0.06 <= planted.interval[1],
				(seed) =>
					excludesZero(
						fairnessDrift(
							'demographic-parity',
							decidedCases(seed, n, { approve: { a: 0.5, b: 0.5 } }),
							decidedCases(seed + 1000, n, { approve: { a: 0.5, b: 0.5 } })
						).interval
					),
				'the 95% interval excludes 0'
			)
		);
	}
	{
		const detected = pageHinkley(series(1, 60, 0.5, 0.01, 0.005)).detectedAt;
		rows.push(
			driftRow(
				'page-hinkley',
				'PH_t = m_t − min m_t, m_t = Σ (x_i − x̄_i − δ); raised when PH_t > λ',
				'none; δ = 0.005, λ = 0.05',
				'none',
				3,
				pageHinkley([0, 0, 0, 1, 1, 1, 1], { delta: 0.1, lambda: 0.5 }).detectedAt ?? -1,
				20,
				detected ?? 60,
				20,
				detected !== undefined && detected <= 20,
				(seed) => pageHinkley(series(seed, 60, 0.5, 0.01)).detectedAt !== undefined,
				'a detection on a flat series with noise σ = 0.01'
			)
		);
	}

	// --- human load
	const loadRow = (
		metric: string,
		definition: string,
		interval: string,
		handExpected: number,
		handGot: number,
		planted: number,
		recovered: { value: number; interval: [number, number] },
		tolerance: number,
		alarm: (seed: number) => boolean,
		alarmText: string
	): ValidationRow => {
		const rate = nullRate(alarm);
		const contained = recovered.interval[0] <= planted && planted <= recovered.interval[1];
		return {
			family: 'human load',
			metric,
			definition,
			interval,
			test: 'none',
			hand: {
				expected: round(handExpected),
				got: round(handGot),
				ok: Math.abs(handExpected - handGot) < 1e-4
			},
			planted: {
				planted,
				recovered: round(recovered.value),
				tolerance,
				contained,
				ok: Math.abs(recovered.value - planted) <= tolerance && contained
			},
			null: { alarm: alarmText, rate, bound, ok: rate <= bound }
		};
	};
	const handLoad = [0, 1, 1, 2, 0, 3].map((count, i) => ({
		id: `h${i}`,
		touches: Array.from({ length: count }, () => ({ kind: 'four-eyes' })),
		decisions: [{ kind: i < 4 ? 'approve' : 'decline', level: 4 as const }]
	}));
	const ceilings = { approve: 4 as const, decline: 3 as const };
	rows.push(
		loadRow(
			'touches-per-case',
			'mean touches per case',
			't interval on the mean',
			7 / 6,
			touchesPerCase(handLoad).value,
			1.5,
			touchesPerCase(touchedCases(1, n, 1.5)),
			0.1,
			(seed) => {
				const r = touchesPerCase(touchedCases(seed, n, 1.5));
				return r.interval[0] > 1.5 || r.interval[1] < 1.5;
			},
			'the 95% interval misses the true mean'
		)
	);
	rows.push(
		loadRow(
			'unattended-rate',
			'the share of cases with no touch',
			'Wilson',
			1 / 3,
			unattendedRate(handLoad).value,
			round(Math.exp(-1.5)),
			unattendedRate(touchedCases(2, n, 1.5)),
			0.03,
			(seed) => {
				const r = unattendedRate(touchedCases(seed, n, 1.5));
				const truth = Math.exp(-1.5);
				return r.interval[0] > truth || r.interval[1] < truth;
			},
			'the 95% interval misses the true rate'
		)
	);
	rows.push(
		loadRow(
			'ceiling-breach-rate',
			'the share of decisions taken above their kind’s ceiling',
			'Wilson',
			1 / 3,
			ceilingBreachRate(handLoad, ceilings).value,
			0.1,
			ceilingBreachRate(touchedCases(3, n, 1.5, { breach: 0.1 }), ceilings),
			0.02,
			(seed) => excludesZero(ceilingBreachRate(touchedCases(seed, n, 1.5), ceilings).interval),
			'the 95% interval excludes 0 with no breach planted'
		)
	);

	return { seeds, n, bound, rows };
}

/** `docs/metrics.md`, rendered from a report. */
export function renderValidationReport(report: ValidationReport): string {
	const lines: string[] = [];
	lines.push('# Metrics: definitions and validation');
	lines.push('');
	lines.push(
		`> Generated by \`npm run metrics:doc\` from \`@craftabot/metrics\`'s validation suite (WP76, \`docs/design-day2/68-METRICS.md\` §4) and checked on every build. Every metric here has a hand case a reader can recompute, a planted effect of a known size it recovered, and a null it did not flag: ${report.seeds} seeds at n = ${report.n}, the false-alarm bound ${report.bound} (5% plus the Wilson margin at ${report.seeds} trials). Do not edit by hand.`
	);
	lines.push('');
	for (const family of ['fairness', 'drift', 'human load'] as const) {
		const rows = report.rows.filter((row) => row.family === family);
		lines.push(`## ${family[0]!.toUpperCase()}${family.slice(1)}`);
		lines.push('');
		lines.push(
			'| Metric | Definition | Interval | Test | Hand case (expected / got) | Planted (planted / recovered / tolerance) | Null (alarm · rate / bound) |'
		);
		lines.push('| --- | --- | --- | --- | --- | --- | --- |');
		for (const row of rows) {
			const mark = (ok: boolean) => (ok ? '✅' : '❌');
			lines.push(
				`| \`${row.metric}\` | ${row.definition} | ${row.interval} | ${row.test} | ${row.hand.expected} / ${row.hand.got} ${mark(row.hand.ok)} | ${row.planted.planted} / ${row.planted.recovered} / ±${row.planted.tolerance}${row.planted.contained === undefined ? '' : row.planted.contained ? ' (interval contains it)' : ' (interval misses it)'} ${mark(row.planted.ok)} | ${row.null.alarm} · ${row.null.rate} / ${row.null.bound} ${mark(row.null.ok)} |`
			);
		}
		lines.push('');
	}
	return lines.join('\n');
}
