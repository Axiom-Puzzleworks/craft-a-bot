import { calibrationRow, type Book, type WorkItem, type WorkItemKind } from '@craftabot/core';
import { seededRandom } from '@craftabot/desk';
import type { Population } from './population/population.js';

/**
 * **The bank clock** (WP83, `71-THE-CLOCK.md` §3; `64-TARGET-DESIGN-V5.md`
 * §6.5.1; tenet 24): work items arriving on a simulated calendar. The clock
 * schedules the books it is handed — an application at its date, an alert
 * at its transaction's time, a complaint at its opening day, an advice
 * request on its day — placing each within its day by an hour-of-day
 * profile and thinning it by a scale, both drawn from the item's own seed,
 * so a window's arrivals are one list whatever the acceleration. The
 * transactions never arrive: they are the stream.
 */
export type HourProfile = readonly number[];

export interface KindRate {
	/** Twenty-four weights, one per hour of the day; normalised by the clock. */
	profile: HourProfile;
	/** The share of the book's items that arrive; 1 keeps every item. */
	scale: number;
}

export type ArrivalRates = Record<WorkItemKind, KindRate>;

export interface ClockOptions {
	population: Population;
	/** ISO dates inside the population's period, inclusive. */
	from: string;
	to: string;
	/** What arrives: the books the host drew from the population. */
	books: readonly Book[];
	rates?: Partial<ArrivalRates>;
	/** Simulated seconds per wall second; `Infinity` runs as fast as it can. */
	acceleration: number;
	seed: number;
}

export interface Arrival {
	/** ISO datetime on the population's calendar. */
	at: string;
	/** The item's place in the day's list — what seeds the run that works it. */
	ordinal: number;
	item: WorkItem;
}

const KINDS: readonly WorkItemKind[] = [
	'application',
	'alert',
	'complaint',
	'advice-request',
	'onboarding',
	'dispute'
];

/** The hour profile the calibration row states (`66-…` `arrival-rates`): a working day with a lunchtime dip; the rest of the day quiet. */
export function hourProfileOf(population: Population): HourProfile {
	const row = calibrationRow(population.options.calibration, 'arrival-rates');
	return Array.from({ length: 24 }, (_, hour) => row.distribution[`h${hour}`] ?? 0);
}

export function defaultArrivalRates(population: Population): ArrivalRates {
	const profile = hourProfileOf(population);
	return Object.fromEntries(KINDS.map((kind) => [kind, { profile, scale: 1 }])) as ArrivalRates;
}

/** A 32-bit mix of the bank's seed and the item's id, so the item's draws are its own. */
export function itemSeed(seed: number, id: string): number {
	let hash = (seed ^ 0x9e3779b9) >>> 0;
	for (let index = 0; index < id.length; index += 1) {
		hash = Math.imul(hash ^ id.charCodeAt(index), 0x01000193) >>> 0;
	}
	hash ^= hash >>> 16;
	hash = Math.imul(hash, 0x85ebca6b) >>> 0;
	hash ^= hash >>> 13;
	return hash >>> 0;
}

const dateOf = (iso: string): string => iso.slice(0, 10);

function hourFrom(profile: HourProfile, draw: number): number {
	const total = profile.reduce((sum, weight) => sum + weight, 0);
	if (total <= 0) return 9;
	let cumulative = 0;
	for (let hour = 0; hour < 24; hour += 1) {
		cumulative += (profile[hour] ?? 0) / total;
		if (draw < cumulative) return hour;
	}
	return 23;
}

/**
 * The deterministic list (`71-…` §2): every item of every book whose day
 * lies in the window, thinned by its kind's scale, placed at an hour and a
 * minute drawn from its seed — an alert keeps its transaction's time —
 * sorted by `at` then id, and numbered.
 */
export function arrivals(options: ClockOptions): Arrival[] {
	const rates = { ...defaultArrivalRates(options.population), ...(options.rates ?? {}) };
	const placed: Array<{ at: string; item: WorkItem }> = [];
	for (const book of options.books) {
		for (const item of book.items) {
			const day = dateOf(item.arrivedAt);
			if (day < options.from || day > options.to) continue;
			const rate = rates[item.kind];
			const random = seededRandom(itemSeed(options.seed, item.id));
			if (random() >= rate.scale) continue;
			if (item.kind === 'alert') {
				placed.push({ at: item.arrivedAt, item });
				continue;
			}
			const hour = hourFrom(rate.profile, random());
			const minute = Math.floor(random() * 60);
			const second = Math.floor(random() * 60);
			placed.push({
				at: `${day}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}.000Z`,
				item
			});
		}
	}
	placed.sort((a, b) => a.at.localeCompare(b.at) || a.item.id.localeCompare(b.item.id));
	return placed.map((entry, ordinal) => ({ ...entry, ordinal }));
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The clock paced (`71-…` §3): the same list, each arrival yielded after
 * `(simulated seconds since the last) / acceleration` wall seconds — none at
 * `Infinity`. A host that wants the list without the wait calls `arrivals`.
 */
export async function* bankClock(options: ClockOptions): AsyncIterable<Arrival> {
	const list = arrivals(options);
	let last: number | undefined;
	for (const arrival of list) {
		const at = Date.parse(arrival.at);
		if (last !== undefined && Number.isFinite(options.acceleration) && options.acceleration > 0) {
			const wait = (at - last) / 1000 / options.acceleration;
			// Under a millisecond is not a wait a timer can keep; only a real pause yields to the clock.
			if (wait * 1000 >= 1) await sleep(wait * 1000);
		}
		last = at;
		yield arrival;
	}
}
