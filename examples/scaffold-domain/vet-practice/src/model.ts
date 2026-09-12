import { seededRandom, syntheticName } from '@craftabot/desk';

/**
 * **The world model** — scaffolded by `craftabot scaffold domain` (WP107,
 * `93-DOMAIN-PACK.md` §4). The root entity is a Patient: the thing every
 * journey in this domain is about, as the bank's is a Customer. Rename its
 * fields to the domain's words; keep every value synthetic and drawn from a
 * seed (hard rule 9 — `@craftabot/desk`'s primitives, never a real record).
 */
export interface Patient {
	/** `patient-<8 hex>`, from the seed. */
	id: string;
	name: { given: string; family: string; full: string };
	/** The one categorical the calibration table draws: replace with the domain's. */
	band: string;
	/** A synthetic figure the journeys read — an amount, a count, a score. */
	figure: number;
}

/** A patient from a seed: the same seed, the same patient, on every machine. */
export function patientFrom(seed: number): Patient {
	const random = seededRandom(seed);
	const name = syntheticName(random);
	const id = `patient-${Math.floor(random() * 0xffffffff)
		.toString(16)
		.padStart(8, '0')}`;
	const band = BANDS[Math.floor(random() * BANDS.length)] as string;
	const figure = 100 + Math.floor(random() * 900);
	return {
		id,
		name: { given: name.given, family: name.family, full: `${name.given} ${name.family}` },
		band,
		figure
	};
}

export const BANDS = ['a', 'b', 'c'] as const;
