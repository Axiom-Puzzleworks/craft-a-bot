/**
 * Mulberry32 — the same generator `@craftabot/core/testing`'s clock and the
 * evals' noisy brain use, so `--seed 7` means the same wrongness everywhere.
 * Every scrap of randomness the harness hands the engine goes through here
 * (hard rule 5): the world stays reproducible from a seed on the command line.
 */
export function mulberry32(seed: number): () => number {
	let state = seed | 0;
	return () => {
		state = (state + 0x6d2b79f5) | 0;
		let t = state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}
