/**
 * The recording script (`98-JEV.md` §8, §10): every call a corpus's
 * experiment will make, as `craftabot record` reads it. Two per row — the
 * request and the need — built by the same `servicingJevRequest` the
 * workflow's line stages use, so the cassette replays each one by digest.
 *
 *     node scripts/calls.ts [v1|v2]    → experiment/calls-<v>.json
 */
import { writeFileSync } from 'node:fs';
import {
	JEV_OPERATION,
	SERVICING_CORPUS,
	SERVICING_CORPUS_V2,
	servicingJevRequest
} from '../dist/index.js';

export const CORPORA = { v1: SERVICING_CORPUS, v2: SERVICING_CORPUS_V2 } as const;
export type CorpusVersion = keyof typeof CORPORA;

export function corpusVersion(arg: string | undefined): CorpusVersion {
	const version = arg ?? 'v1';
	if (!(version in CORPORA)) throw new Error(`no corpus '${version}' — try v1 or v2`);
	return version as CorpusVersion;
}

export function writeCalls(version: CorpusVersion): string {
	const corpus = CORPORA[version];
	const calls = corpus.flatMap((row) =>
		(['category', 'need'] as const).map((question) => ({
			op: JEV_OPERATION,
			args: servicingJevRequest(question, row.text)
		}))
	);
	const file = `experiment/calls-${version}.json`;
	writeFileSync(file, `${JSON.stringify(calls, null, '\t')}\n`);
	console.log(`wrote ${file} — ${calls.length} calls over ${corpus.length} rows`);
	return file;
}

if (process.argv[1]?.endsWith('calls.ts')) {
	writeCalls(corpusVersion(process.argv[2]));
}
