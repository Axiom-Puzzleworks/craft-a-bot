/**
 * Deterministic `now`/`newId`/`random` for sessions under test.
 *
 * Real timestamps and UUIDs would make every captured trace differ from the
 * last, which would defeat the point of a trace fixture and, later, of replay
 * verification (08-GOVERNANCE-GUARDRAILS.md §4). Feeding these into
 * `SessionOptions` makes a run byte-reproducible.
 */

export interface TestClock {
	now(): string;
	newId(): string;
	random(): number;
	reset(): void;
}

const EPOCH = Date.UTC(2026, 7, 12, 10, 0, 0);

export function createTestClock(
	options: { stepMs?: number; seed?: number; idOffset?: number } = {}
): TestClock {
	const stepMs = options.stepMs ?? 1000;
	const seed = options.seed ?? 1;
	/**
	 * Where the id counter starts.
	 *
	 * Deterministic ids are the point of this clock, and they are per-*clock*:
	 * two sessions each get `…000000000001`. That is right for a fixture and
	 * wrong the moment several runs are stored side by side — WP23's Eval Matrix
	 * found it, where every cell of a matrix carried the same `runId`, so the
	 * report's join key joined everything to everything and opening a second
	 * cell appended its trace onto the first.
	 *
	 * An offset keeps the ids reproducible *and* distinct: cell *n* starts its
	 * numbering somewhere no other cell will reach.
	 */
	const idOffset = options.idOffset ?? 0;

	let calls = 0;
	let ids = idOffset;
	let randomState = seed;

	return {
		now() {
			const timestamp = new Date(EPOCH + calls * stepMs).toISOString();
			calls += 1;
			return timestamp;
		},
		newId() {
			ids += 1;
			// Shaped like a v4 UUID so it still satisfies the event schema.
			const hex = ids.toString(16).padStart(12, '0');
			return `00000000-0000-4000-8000-${hex}`;
		},
		random() {
			// Mulberry32 — small, fast, and perfectly repeatable.
			randomState = (randomState + 0x6d2b79f5) | 0;
			let t = randomState;
			t = Math.imul(t ^ (t >>> 15), t | 1);
			t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
			return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
		},
		reset() {
			calls = 0;
			ids = idOffset;
			randomState = seed;
		}
	};
}
