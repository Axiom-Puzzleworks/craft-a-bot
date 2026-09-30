import { canonicalJson, sha256Hex } from '@craftabot/core';
import { describe, expect, it } from 'vitest';
import { SERVICING_CORPUS } from './corpus.js';
import { SERVICING_CORPUS_V2 } from './corpus-v2.js';
import { SERVICING_CORPUS_V3 } from './corpus-v3.js';

/**
 * **Nothing lost in the move** (WP119, `105-CORPORA.md` §7): the three
 * corpora now live as content in `fs-servicing`, and the rows this pack reads
 * are a view of them. Each view hashes to the freeze hash the branch recorded
 * before any call (`experiment/README.md` §4.4) — SHA-256 over the canonical
 * JSON of the rows as the pack exported them — so every text, label, tag,
 * contested reason and second label is the one the experiment was run on.
 */
describe('the corpora, moved to content (WP119)', () => {
	for (const [name, rows, hash] of [
		['v1', SERVICING_CORPUS, '46379f9ffb65f905fd2fb4fd826ee9d17ef8ff53d5738630d9aba60e4a8695fc'],
		['v2', SERVICING_CORPUS_V2, 'c4ee02decfd2826107faed0c4ef8e7919cbff66ba7994753d511da7ccb28b83c'],
		['v3', SERVICING_CORPUS_V3, '3c90c8a3c75cdd494419791d055c2c7ce6640e3440bd07cc301ba299e141c7ab']
	] as const) {
		it(`${name} hashes to the branch's freeze hash`, () => {
			expect(sha256Hex(canonicalJson(rows))).toBe(hash);
		});
	}
});
