/**
 * A small seeded generator (mulberry32) for the desk's own stream.
 *
 * A session hands a world its `random` at `create` (WP53, `43-…` §4.4), and
 * that function is stateful and shared — the dice tool draws from it too —
 * so a desk cannot replay it on `reset`. The runtime therefore draws **one**
 * number from the session's `random` to seed a stream of its own, and keeps
 * the seed: a reset rebuilds the same stream and the case comes out
 * byte-identical (hard rule 5). With no `random` at all (the testkit, a bare
 * `create(layoutId)`), the seed is fixed, so a desk is deterministic either way.
 */
export function seededRandom(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

export const DEFAULT_SEED = 0x5eed;

/** One draw from the caller's stream becomes the desk's seed; none becomes the fixed default. */
export function seedFrom(random: (() => number) | undefined): number {
	if (random === undefined) return DEFAULT_SEED;
	return Math.floor(random() * 0x7fffffff);
}
