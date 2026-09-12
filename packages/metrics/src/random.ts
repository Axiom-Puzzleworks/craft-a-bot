/**
 * The validation suite's own PRNG (WP76, `68-METRICS.md` §1 item 5):
 * mulberry32 over a 32-bit seed, so a planted effect and a null are the
 * same rows every run. The package may depend on `core` types only, so
 * this is not `@craftabot/desk`'s `seededRandom` — and it need not be: the
 * suite's generators are its own.
 */
export function mulberry32(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/** A standard normal draw by Box–Muller. */
export function gaussian(random: () => number): number {
	let u = 0;
	while (u === 0) u = random();
	const v = random();
	return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
