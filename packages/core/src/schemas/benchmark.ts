import { z } from 'zod';
import { canonicalJson } from './cassette.js';
import { sha256Hex } from './sha256.js';

/**
 * **A benchmark's report** (WP123, `106-BENCHMARK.md` §6;
 * `100-TARGET-DESIGN-V7.md` §6.6, D19, tenet 37): every subject — a guard
 * service, a reader fitted as a guard, a bespoke component — over the same
 * adversarial rows, and what each flagged. Precision and recall on
 * `attack ≠ none` with their Wilson intervals, the rows by attack, by target
 * and by surface, latency where it was recorded, tokens and a list price
 * where the subject has them, and the rows each subject alone caught or
 * alone missed. Digested like an experiment's result; the Guard Rack, the
 * catalogue's coverage and the assurance pack read it.
 */
const rate = z.object({
	/** Null where the denominator is empty — a subject that flagged nothing has no precision. */
	value: z.number().min(0).max(1).nullable(),
	interval: z.tuple([z.number(), z.number()]).nullable()
});
export type BenchmarkRate = z.infer<typeof rate>;

/** Rows in a slice, and how many of them the subject flagged. */
const cell = z.object({ rows: z.number().int().min(0), flagged: z.number().int().min(0) });

export const BENCHMARK_SUBJECT_KINDS = ['service', 'reader', 'component'] as const;
/**
 * How the subject answered: `stand-in` its canned offline client (which
 * measures nothing — every shipped stand-in answers clean), `cassette` its
 * recorded answers replayed, `live` a call made now, `local` a reader or
 * component that needs no network (a rule, a mock).
 */
export const BENCHMARK_MODES = ['stand-in', 'cassette', 'live', 'local'] as const;

export const benchmarkSubjectSchema = z.object({
	id: z.string().min(1),
	kind: z.enum(BENCHMARK_SUBJECT_KINDS),
	name: z.string().min(1),
	/** The guard component the subject is registered as, where it is one — how the catalogue finds it. */
	componentId: z.string().min(1).optional(),
	mode: z.enum(BENCHMARK_MODES),
	/** False with a reason for a subject the corpus cannot measure: a policy decision point screens actions, not text. */
	applicable: z.boolean(),
	reason: z.string().min(1).optional(),
	n: z.number().int().min(0),
	flagged: z.number().int().min(0),
	/** Screens that failed or missed their cassette: counted, never flagged. */
	errors: z.number().int().min(0),
	confusion: z.object({
		tp: z.number().int().min(0),
		fp: z.number().int().min(0),
		fn: z.number().int().min(0),
		tn: z.number().int().min(0)
	}),
	precision: rate,
	recall: rate,
	/** Benign rows flagged over benign rows. */
	falseAlarms: rate,
	byAttack: z.record(z.string(), cell),
	byTarget: z.record(z.string(), cell),
	bySurface: z.record(z.string(), cell),
	/** Milliseconds, from the recorded calls; null when none were recorded (a stand-in, a rule). */
	latency: z.object({ p50: z.number().min(0), p95: z.number().min(0) }).nullable(),
	tokens: z.number().int().min(0).nullable(),
	/** US dollars for the run at the benchmark file's cited list price; null when none is cited. */
	listPriceUsd: z.number().min(0).nullable(),
	/** `corpusId#rowId` of the attack rows this subject flagged and no other applicable subject did. */
	caughtAlone: z.array(z.string()),
	/** Of the attack rows every other applicable subject flagged, the ones this subject missed. */
	missedAlone: z.array(z.string())
});
export type BenchmarkSubjectResult = z.infer<typeof benchmarkSubjectSchema>;

export const benchmarkReportSchema = z.object({
	schemaVersion: z.literal(1),
	/** `<benchmarkId>@<ranAt>`. */
	id: z.string().min(1),
	benchmarkId: z.string().min(1),
	name: z.string().min(1),
	ranAt: z.string().min(1),
	/** Every row is synthetic; the page and the renderings say so first. */
	synthetic: z.literal(true),
	/** P(attack) at or above which a reader flags. */
	threshold: z.number().min(0).max(1),
	corpora: z.array(
		z.object({
			id: z.string().min(1),
			digest: z.string().regex(/^[0-9a-f]{64}$/),
			rows: z.number().int().min(0),
			attacks: z.number().int().min(0)
		})
	),
	subjects: z.array(benchmarkSubjectSchema),
	/** SHA-256 over the canonical JSON of everything but the digest and `ranAt` (`benchmarkReportDigest`). */
	digest: z.string().regex(/^[0-9a-f]{64}$/)
});
export type BenchmarkReport = z.infer<typeof benchmarkReportSchema>;

/**
 * The digest: canonical, over the report less its `digest`, `id` and
 * `ranAt` — so the same benchmark over the same rows and the same answers
 * digests the same whenever it runs.
 */
export function benchmarkReportDigest(report: Omit<BenchmarkReport, 'digest'>): string {
	const { id: _id, ranAt: _ranAt, ...rest } = report as BenchmarkReport;
	void _id;
	void _ranAt;
	const { digest: _digest, ...body } = rest as BenchmarkReport;
	void _digest;
	return sha256Hex(canonicalJson(body));
}

export function safeParseBenchmarkReport(value: unknown) {
	return benchmarkReportSchema.safeParse(value);
}

/** Newest first, then by id. */
export function byNewestBenchmarkReport(a: BenchmarkReport, b: BenchmarkReport): number {
	return b.ranAt.localeCompare(a.ranAt) || a.id.localeCompare(b.id);
}

/**
 * The latest report that measured a subject, and its row — what the Guard
 * Rack and the catalogue read. A subject only a stand-in answered was not
 * measured: the stand-in answers clean whatever it is shown.
 */
export function latestMeasurement(
	reports: readonly BenchmarkReport[],
	subjectId: string
): { report: BenchmarkReport; subject: BenchmarkSubjectResult } | undefined {
	for (const report of [...reports].sort(byNewestBenchmarkReport)) {
		const subject = report.subjects.find(
			(each) =>
				(each.id === subjectId || each.componentId === subjectId) &&
				each.applicable &&
				each.mode !== 'stand-in'
		);
		if (subject) return { report, subject };
	}
	return undefined;
}
