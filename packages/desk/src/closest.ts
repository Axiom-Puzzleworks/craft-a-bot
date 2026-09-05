/**
 * Closest-match over names, for `ActionResult.didYouMean` (`16-…` §2.4):
 * the runtime's own, since core exports none and the Playroom keeps its own
 * (`43-…` §4.4). Plain Levenshtein over lower-cased strings; ties keep the
 * candidates' own order, so the answer is stable for a golden trace.
 */
function distance(a: string, b: string): number {
	const rows = a.length + 1;
	const cols = b.length + 1;
	const table: number[] = new Array<number>(rows * cols).fill(0);
	for (let i = 0; i < rows; i++) table[i * cols] = i;
	for (let j = 0; j < cols; j++) table[j] = j;
	for (let i = 1; i < rows; i++) {
		for (let j = 1; j < cols; j++) {
			const cost = a[i - 1] === b[j - 1] ? 0 : 1;
			table[i * cols + j] = Math.min(
				(table[(i - 1) * cols + j] as number) + 1,
				(table[i * cols + j - 1] as number) + 1,
				(table[(i - 1) * cols + j - 1] as number) + cost
			);
		}
	}
	return table[rows * cols - 1] as number;
}

/**
 * The `limit` candidates nearest to `name`, nearest first. A candidate is
 * offered only when it is within a couple of edits, or a third of its own
 * length for a long name — a suggestion that shares little with what was
 * typed is noise, not help, and a golden trace should not carry noise.
 */
export function closest(name: string, candidates: readonly string[], limit = 3): string[] {
	const wanted = name.trim().toLowerCase();
	if (wanted.length === 0) return [];
	return candidates
		.map((candidate, index) => ({ candidate, index, d: distance(wanted, candidate.toLowerCase()) }))
		.filter(({ candidate, d }) => d <= Math.max(2, Math.floor(candidate.length / 3)))
		.sort((a, b) => a.d - b.d || a.index - b.index)
		.slice(0, limit)
		.map(({ candidate }) => candidate);
}
