/**
 * The recording script (`98-JEV.md` §8): every call the servicing experiment
 * will make, as `craftabot record` reads it. Two per corpus row — the request
 * and the need — built by the same `servicingJevRequest` the workflow's line
 * stages use, so the cassette replays every one of them by digest.
 */
import { writeFileSync } from 'node:fs';
import { JEV_OPERATION, SERVICING_CORPUS, servicingJevRequest } from '../dist/index.js';

const calls = SERVICING_CORPUS.flatMap((row) =>
	(['category', 'need'] as const).map((question) => ({
		op: JEV_OPERATION,
		args: servicingJevRequest(question, row.text)
	}))
);
writeFileSync('experiment/calls.json', `${JSON.stringify(calls, null, '\t')}\n`);
console.log(
	`wrote experiment/calls.json — ${calls.length} calls over ${SERVICING_CORPUS.length} rows`
);
