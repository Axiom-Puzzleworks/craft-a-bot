import {
	syntheticAddress,
	syntheticEmail,
	syntheticName,
	syntheticNiNumber,
	syntheticPhone
} from '@craftabot/desk';
import {
	AGE_BANDS,
	INCOME_BANDS,
	PROTECTED_PROXIES,
	VULNERABILITY_DRIVERS,
	type AgeBand,
	type CohortBlock,
	type Customer,
	type DigitalConfidence,
	type Employment,
	type IncomeBand,
	type LiteracyBand,
	type VulnerabilityDrivers
} from '../model.js';
import { EMPLOYERS } from './vocab.js';
import { calibrationRow, type CalibrationRow, type CalibrationTable } from '@craftabot/core';
import { DECK_WEIGHTS } from '../calibration/deck-weights.js';

/** Weighted pick: `weights` sum to anything; the draw is one `random()`. */
export function weighted<T>(random: () => number, entries: ReadonlyArray<readonly [T, number]>): T {
	const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
	let at = random() * total;
	for (const [value, weight] of entries) {
		at -= weight;
		if (at < 0) return value;
	}
	return entries[entries.length - 1]![0];
}

export const pick = <T>(random: () => number, from: readonly T[]): T =>
	from[Math.floor(random() * from.length)] as T;

/**
 * **A draw from a calibration row** (WP74, `66-CALIBRATION.md` §4.2): the
 * same arithmetic as `weighted` over the row's entries in the row's declared
 * order, so a row whose weights equal the inline table it replaced draws
 * byte-identically. `rateOf` reads a `rates` row's probability by category.
 */
export function weightedRow<T extends string = string>(
	random: () => number,
	row: CalibrationRow
): T {
	return weighted(random, Object.entries(row.distribution) as Array<[T, number]>);
}

export function rateOf(row: CalibrationRow, category: string): number {
	const rate = row.distribution[category];
	if (rate === undefined) throw new Error(`calibration row "${row.id}" has no rate "${category}"`);
	return rate;
}

/** The table a generator draws from: the deck weights unless a population hands in the cited table. */
export type Calibrated = { calibration?: CalibrationTable | undefined };
export const tableOf = (options: Calibrated | undefined): CalibrationTable =>
	options?.calibration ?? DECK_WEIGHTS;

/** `cust-` and eight hex digits from the stream. */
export function hexId(random: () => number, prefix: string, length = 8): string {
	let out = '';
	for (let i = 0; i < length; i += 1) out += Math.floor(random() * 16).toString(16);
	return `${prefix}-${out}`;
}

function incomeFor(
	random: () => number,
	employment: Employment,
	table: CalibrationTable
): IncomeBand {
	if (employment === 'student' || employment === 'unemployed' || employment === 'carer') {
		return weightedRow<IncomeBand>(random, calibrationRow(table, 'income-not-earning'));
	}
	if (employment === 'retired') {
		return weightedRow<IncomeBand>(random, calibrationRow(table, 'income-retired'));
	}
	return weightedRow<IncomeBand>(random, calibrationRow(table, 'income-working'));
}

function employmentFor(
	random: () => number,
	ageBand: AgeBand,
	table: CalibrationTable
): Employment {
	if (ageBand === '75+' || ageBand === '65-74') {
		return weightedRow<Employment>(random, calibrationRow(table, 'employment-65-plus'));
	}
	if (ageBand === '18-24') {
		return weightedRow<Employment>(random, calibrationRow(table, 'employment-18-24'));
	}
	return weightedRow<Employment>(random, calibrationRow(table, 'employment-25-64'));
}

/**
 * A driver per grouping at the row's per-draw rate, so most customers carry
 * none in most groupings: a first draw at `p`, a second at `p / 4`, both
 * independent, so the share with any is `1 − (1 − p)(1 − p / 4)` — the
 * arithmetic the cited table's row inverts (`calibration/rows.ts`).
 */
function driversFor(random: () => number, rates: CalibrationRow): VulnerabilityDrivers {
	const draw = (pool: readonly string[], rate: number): string[] => {
		const out: string[] = [];
		if (random() < rate) out.push(pick(random, pool));
		if (random() < rate / 4) {
			const second = pick(random, pool);
			if (!out.includes(second)) out.push(second);
		}
		return out;
	};
	return {
		health: draw(VULNERABILITY_DRIVERS.health, rateOf(rates, 'health')),
		lifeEvents: draw(VULNERABILITY_DRIVERS.lifeEvents, rateOf(rates, 'lifeEvents')),
		resilience: draw(VULNERABILITY_DRIVERS.resilience, rateOf(rates, 'resilience')),
		capability: draw(VULNERABILITY_DRIVERS.capability, rateOf(rates, 'capability'))
	};
}

/** What the customer told the bank: each driver kept with probability `share`. */
function disclosedFrom(
	random: () => number,
	all: VulnerabilityDrivers,
	share: number
): VulnerabilityDrivers {
	const keep = (ids: string[]) => ids.filter(() => random() < share);
	return {
		health: keep(all.health),
		lifeEvents: keep(all.lifeEvents),
		resilience: keep(all.resilience),
		capability: keep(all.capability)
	};
}

export function generateCustomer(random: () => number, options?: Calibrated): Customer {
	const table = tableOf(options);
	const id = hexId(random, 'cust');
	const name = syntheticName(random);
	const ageBand = weightedRow<AgeBand>(random, calibrationRow(table, 'age-band'));
	const employment = employmentFor(random, ageBand, table);
	const incomeBand = incomeFor(random, employment, table);
	const literacyBand = weightedRow<LiteracyBand>(random, calibrationRow(table, 'literacy-band'));
	const digitalConfidence = weightedRow<DigitalConfidence>(
		random,
		calibrationRow(
			table,
			ageBand === '75+' || ageBand === '65-74'
				? 'digital-confidence-65-plus'
				: 'digital-confidence-under-65'
		)
	);
	const vulnerability = driversFor(random, calibrationRow(table, 'vulnerability-drivers'));
	if (literacyBand === 'low' && !vulnerability.capability.includes('low-literacy')) {
		vulnerability.capability.push('low-literacy');
	}
	if (digitalConfidence === 'low' && !vulnerability.capability.includes('low-digital-confidence')) {
		vulnerability.capability.push('low-digital-confidence');
	}
	const proxyRate = rateOf(calibrationRow(table, 'protected-proxy-rate'), 'proxy');
	const proxies = PROTECTED_PROXIES.filter(() => random() < proxyRate);
	const cohort: CohortBlock = {
		ageBand,
		incomeBand,
		protectedProxies: proxies.length > 0 ? [...proxies] : [pick(random, PROTECTED_PROXIES)],
		supportNeeds:
			vulnerability.health.length > 0 &&
			random() < rateOf(calibrationRow(table, 'support-needs'), 'supportNeeds'),
		literacyBand
	};
	const consent = calibrationRow(table, 'consent');
	const ageLow = ageBand === '75+' ? 75 : Number(ageBand.split('-')[0]);
	const ageHigh = ageBand === '75+' ? 92 : Number(ageBand.split('-')[1]);
	const age = ageLow + Math.floor(random() * (ageHigh - ageLow + 1));
	return {
		id,
		name,
		dateOfBirthYear: 2026 - age,
		address: syntheticAddress(random),
		email: syntheticEmail(random, name),
		phone: syntheticPhone(random),
		employment,
		...(employment === 'employed' ? { employer: pick(random, EMPLOYERS) } : {}),
		dependants: Number(weightedRow(random, calibrationRow(table, 'dependants'))),
		tenureYears: Math.min(Math.floor(random() * 30), Math.max(0, age - 18)),
		digitalConfidence,
		cohort,
		vulnerability,
		disclosed: disclosedFrom(
			random,
			vulnerability,
			rateOf(calibrationRow(table, 'vulnerability-disclosure'), 'disclosed')
		),
		consent: {
			marketing: random() < rateOf(consent, 'marketing'),
			dataSharing: random() < rateOf(consent, 'dataSharing'),
			preferredChannel: weightedRow<'app' | 'phone' | 'branch' | 'post'>(
				random,
				calibrationRow(table, 'preferred-channel')
			)
		},
		niNumber: syntheticNiNumber(random)
	};
}

export const AGE_BAND_INDEX = (band: AgeBand): number => AGE_BANDS.indexOf(band);
export const INCOME_BAND_INDEX = (band: IncomeBand): number => INCOME_BANDS.indexOf(band);
