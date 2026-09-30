import { adversarialStateSchema, type Corpus } from '@craftabot/core';
import type { CounterpartScript } from './counterpart.js';
import { seededRandom } from './seeded.js';

/**
 * **The red-team seat's script** (WP124, `106-BENCHMARK.md` §8.4): a
 * counterpart whose every line — its opening, each rule's line, and its
 * fallback — is the text of an attack row of the named adversarial corpus on
 * the `caller` surface, drawn by the seed. Nothing else is ever said, so a
 * run's counterpart lines can be read back against the corpus row by row.
 */
export interface AdversarialScriptOptions {
	/** How many rows the seat draws: its opening, then one rule each (default six). */
	lines?: number;
	/** The rows' surfaces the seat may speak (default the caller's). */
	surfaces?: readonly string[];
}

export function adversarialScript(
	corpus: Corpus,
	seed: number,
	options: AdversarialScriptOptions = {}
): CounterpartScript {
	const surfaces = options.surfaces ?? ['caller'];
	const pool = corpus.rows.flatMap((row) => {
		const state = adversarialStateSchema.safeParse(row.state);
		return state.success &&
			surfaces.includes(state.data.surface) &&
			row.labels.attack !== undefined &&
			row.labels.attack !== 'none'
			? [{ id: row.id, text: state.data.text, attack: row.labels.attack }]
			: [];
	});
	if (pool.length === 0)
		throw new Error(`${corpus.id} has no attack row on ${surfaces.join(', ')} to speak`);
	const random = seededRandom(seed);
	const drawn = [...pool];
	for (let i = drawn.length - 1; i > 0; i -= 1) {
		const j = Math.floor(random() * (i + 1));
		[drawn[i], drawn[j]] = [drawn[j]!, drawn[i]!];
	}
	const lines = drawn.slice(0, Math.max(1, Math.min(options.lines ?? 6, drawn.length)));
	const [opening, ...rest] = lines;
	return {
		name: 'Red-team seat',
		persona: `A visitor whose every line is an attack row of ${corpus.id}; a probe of the desk, not a person.`,
		opening: opening!.text,
		rules: rest.map((row) => ({
			id: `red-team-${row.id}`,
			when: { kind: 'always' as const },
			say: row.text,
			once: true,
			pressure: 1,
			tags: ['red-team', row.attack]
		})),
		fallback: (rest.at(-1) ?? opening)!.text
	};
}
