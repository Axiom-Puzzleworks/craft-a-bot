/**
 * **Record a corpus** (`98-JEV.md` §10): write the corpus's calls, record them
 * live through `craftabot record` (the one path that runs a line's `live`,
 * under the egress guard), then **merge** the new entries into the shipped
 * cassette. Entries already on file are kept byte for byte, so recording v2
 * never re-asks, or overwrites, what v1 was answered.
 *
 *     npm run record -w @craftabot/pack-typesafe -- v3 q2 [jev|spark]
 *
 * It needs `CRAFTABOT_CREDENTIAL_TYPESAFE` (in `.env`). Never run in CI.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { corpusVersion, questionsVersion, servicingReader, writeCalls } from './calls.ts';

/** Each reader's line, and the cassette its pack ships: Jev's here, the Spark's in `@craftabot/pack-dgx-spark`. */
const READERS = {
	jev: { line: 'typesafe/jev', cassette: 'src/cassettes/typesafe-jev.craftabot-cassette.json' },
	spark: {
		line: 'dgx-spark/classifier',
		cassette: '../dgx-spark/src/cassettes/dgx-spark-classifier.craftabot-cassette.json'
	}
} as const;

interface Cassette {
	recordedAt: string;
	recordedBy: string;
	egress: unknown[];
	entries: { argsDigest: string }[];
}

const version = corpusVersion(process.argv[2]);
const questions = questionsVersion(process.argv[3]);
const reader = servicingReader(process.argv[4]);
const { line, cassette: CASSETTE } = READERS[reader];
const calls = writeCalls(version, questions, reader);
const out = `experiment/recording-${version}-q${questions}-${reader}`;
execFileSync(
	process.execPath,
	[
		'../../harness/dist/main.js',
		'record',
		'--config',
		'craftabot.config.mjs',
		'--line',
		line,
		'--script',
		calls,
		'--out',
		out
	],
	{ stdio: 'inherit' }
);

const shipped = JSON.parse(readFileSync(CASSETTE, 'utf8')) as Cassette;
const fresh = JSON.parse(
	readFileSync(`${out}/${line.replaceAll('/', '-')}.craftabot-cassette.json`, 'utf8')
) as Cassette;
const known = new Set(shipped.entries.map((entry) => entry.argsDigest));
const added = fresh.entries.filter((entry) => !known.has(entry.argsDigest));
const merged = {
	...shipped,
	recordedAt: fresh.recordedAt,
	recordedBy: fresh.recordedBy,
	egress: fresh.egress,
	entries: [...shipped.entries, ...added]
};
writeFileSync(CASSETTE, `${JSON.stringify(merged, null, '\t')}\n`);
console.log(
	`merged ${added.length} new entries into ${CASSETTE} (${fresh.entries.length - added.length} already on file; ${merged.entries.length} in all)`
);
