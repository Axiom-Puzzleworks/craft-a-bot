/**
 * The recording script (`98-JEV.md` §8, §10, §11): every call a corpus's
 * experiment makes under one version of the questions, as `craftabot record`
 * reads it. Two calls per row: the request (with the steer in version 2) and
 * the need. Both are built by the same `servicingJevRequest` the workflow's
 * line stages use, so the cassette replays each one by digest.
 *
 *     node scripts/calls.ts [v1|v2|v3] [q1|q2] [jev|spark]    → experiment/calls-<v>-<q>[-spark].json
 *
 * `spark` builds the same requests for the DGX Spark classifier line (`99-DGX-SPARK.md` §6).
 */
import { writeFileSync } from 'node:fs';
import {
	JEV_OPERATION,
	SERVICING_CORPUS,
	SERVICING_CORPUS_V2,
	SERVICING_CORPUS_V3,
	readerRequest,
	type QuestionsVersion,
	type ServicingReader
} from '../dist/index.js';

export const CORPORA = {
	v1: SERVICING_CORPUS,
	v2: SERVICING_CORPUS_V2,
	v3: SERVICING_CORPUS_V3
} as const;
export type CorpusVersion = keyof typeof CORPORA;

export function corpusVersion(arg: string | undefined): CorpusVersion {
	const version = arg ?? 'v1';
	if (!(version in CORPORA)) throw new Error(`no corpus '${version}' — try v1, v2 or v3`);
	return version as CorpusVersion;
}

export function questionsVersion(arg: string | undefined): QuestionsVersion {
	const version = arg ?? 'q1';
	if (version === 'q1') return 1;
	if (version === 'q2') return 2;
	throw new Error(`no questions '${version}' — try q1 or q2`);
}

export function servicingReader(arg: string | undefined): ServicingReader {
	const reader = arg ?? 'jev';
	if (reader === 'jev' || reader === 'spark') return reader;
	throw new Error(`no reader '${reader}' — try jev or spark`);
}

export function writeCalls(
	corpus: CorpusVersion,
	questions: QuestionsVersion,
	reader: ServicingReader = 'jev'
): string {
	const rows = CORPORA[corpus];
	const request = readerRequest(reader);
	const calls = rows.flatMap((row) =>
		(['category', 'need'] as const).map((question) => ({
			op: JEV_OPERATION,
			args: request(question, row.text, questions)
		}))
	);
	const file = `experiment/calls-${corpus}-q${questions}${reader === 'jev' ? '' : `-${reader}`}.json`;
	writeFileSync(file, `${JSON.stringify(calls, null, '\t')}\n`);
	console.log(`wrote ${file} — ${calls.length} calls over ${rows.length} rows`);
	return file;
}

if (process.argv[1]?.endsWith('calls.ts')) {
	writeCalls(
		corpusVersion(process.argv[2]),
		questionsVersion(process.argv[3]),
		servicingReader(process.argv[4])
	);
}
