/**
 * **Per-customer and per-day seeds** (WP74 stage B, `66-CALIBRATION.md`
 * §4.3): customer *k* of a population is `seededRandom(customerSeed(seed,
 * k))`, so customer *k* is the same whatever the population's size — a
 * population of 2,000 is the first 2,000 of 20,000, and the harness can
 * shard by ordinal. An account's day of transactions is likewise its own
 * seed, so `forAccount(id, day)` is pure and lazy. The mixes are 32-bit
 * integer hashes (murmur-style finalisers), with fixed vectors in the test.
 */
function mix(x: number): number {
	let h = x >>> 0;
	h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
	h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
	return (h ^ (h >>> 16)) >>> 0;
}

/** The seed for customer `ordinal` (0-based) of the population seeded `seed`. */
export function customerSeed(seed: number, ordinal: number): number {
	return mix(mix(seed >>> 0) ^ Math.imul(ordinal + 1, 0x9e3779b1));
}

/** The seed for account `accountIndex` of a customer on calendar day `dayIndex`. */
export function accountDaySeed(customer: number, accountIndex: number, dayIndex: number): number {
	return mix(
		mix(customer ^ Math.imul(accountIndex + 1, 0x85ebca77)) ^ Math.imul(dayIndex + 1, 0xc2b2ae3d)
	);
}
