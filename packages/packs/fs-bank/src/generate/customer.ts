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

/** `cust-` and eight hex digits from the stream. */
export function hexId(random: () => number, prefix: string, length = 8): string {
	let out = '';
	for (let i = 0; i < length; i += 1) out += Math.floor(random() * 16).toString(16);
	return `${prefix}-${out}`;
}

const AGE_WEIGHTS: ReadonlyArray<readonly [AgeBand, number]> = [
	['18-24', 8],
	['25-34', 18],
	['35-44', 20],
	['45-54', 18],
	['55-64', 16],
	['65-74', 12],
	['75+', 8]
];

function incomeFor(random: () => number, employment: Employment): IncomeBand {
	if (employment === 'student' || employment === 'unemployed' || employment === 'carer') {
		return weighted(random, [
			['under-15k', 6],
			['15-25k', 3],
			['25-40k', 1]
		]);
	}
	if (employment === 'retired') {
		return weighted(random, [
			['under-15k', 3],
			['15-25k', 5],
			['25-40k', 3],
			['40-60k', 1]
		]);
	}
	return weighted(random, [
		['15-25k', 4],
		['25-40k', 8],
		['40-60k', 6],
		['60-100k', 3],
		['over-100k', 1]
	]);
}

function employmentFor(random: () => number, ageBand: AgeBand): Employment {
	if (ageBand === '75+' || ageBand === '65-74') {
		return weighted(random, [
			['retired', 8],
			['employed', 1],
			['self-employed', 1]
		]);
	}
	if (ageBand === '18-24') {
		return weighted(random, [
			['student', 4],
			['employed', 5],
			['unemployed', 1]
		]);
	}
	return weighted(random, [
		['employed', 12],
		['self-employed', 3],
		['carer', 1],
		['unemployed', 1]
	]);
}

/** A driver per grouping at a low rate, so most customers carry none in most groupings. */
function driversFor(random: () => number, rate: number): VulnerabilityDrivers {
	const draw = (pool: readonly string[]): string[] => {
		const out: string[] = [];
		if (random() < rate) out.push(pick(random, pool));
		if (random() < rate / 4) {
			const second = pick(random, pool);
			if (!out.includes(second)) out.push(second);
		}
		return out;
	};
	return {
		health: draw(VULNERABILITY_DRIVERS.health),
		lifeEvents: draw(VULNERABILITY_DRIVERS.lifeEvents),
		resilience: draw(VULNERABILITY_DRIVERS.resilience),
		capability: draw(VULNERABILITY_DRIVERS.capability)
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

export function generateCustomer(random: () => number): Customer {
	const id = hexId(random, 'cust');
	const name = syntheticName(random);
	const ageBand = weighted(random, AGE_WEIGHTS);
	const employment = employmentFor(random, ageBand);
	const incomeBand = incomeFor(random, employment);
	const literacyBand: LiteracyBand = weighted(random, [
		['low', 2],
		['medium', 5],
		['high', 3]
	]);
	const digitalConfidence: DigitalConfidence =
		ageBand === '75+' || ageBand === '65-74'
			? weighted(random, [
					['low', 4],
					['medium', 4],
					['high', 2]
				])
			: weighted(random, [
					['low', 1],
					['medium', 4],
					['high', 5]
				]);
	const vulnerability = driversFor(random, 0.18);
	if (literacyBand === 'low' && !vulnerability.capability.includes('low-literacy')) {
		vulnerability.capability.push('low-literacy');
	}
	if (digitalConfidence === 'low' && !vulnerability.capability.includes('low-digital-confidence')) {
		vulnerability.capability.push('low-digital-confidence');
	}
	const proxies = PROTECTED_PROXIES.filter(() => random() < 0.3);
	const cohort: CohortBlock = {
		ageBand,
		incomeBand,
		protectedProxies: proxies.length > 0 ? [...proxies] : [pick(random, PROTECTED_PROXIES)],
		supportNeeds: vulnerability.health.length > 0 && random() < 0.6,
		literacyBand
	};
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
		dependants: weighted(random, [
			[0, 6],
			[1, 3],
			[2, 3],
			[3, 1]
		]),
		tenureYears: Math.min(Math.floor(random() * 30), Math.max(0, age - 18)),
		digitalConfidence,
		cohort,
		vulnerability,
		disclosed: disclosedFrom(random, vulnerability, 0.5),
		consent: {
			marketing: random() < 0.4,
			dataSharing: random() < 0.3,
			preferredChannel: weighted(random, [
				['app', 5],
				['phone', 3],
				['branch', 1],
				['post', 1]
			])
		},
		niNumber: syntheticNiNumber(random)
	};
}

export const AGE_BAND_INDEX = (band: AgeBand): number => AGE_BANDS.indexOf(band);
export const INCOME_BAND_INDEX = (band: IncomeBand): number => INCOME_BANDS.indexOf(band);
