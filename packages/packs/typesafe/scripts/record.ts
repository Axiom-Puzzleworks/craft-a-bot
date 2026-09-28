/**
 * **Record a corpus** (`98-JEV.md` §10): write the corpus's calls, record them
 * live through `craftabot record` (the one path that runs a line's `live`,
 * under the egress guard), then **merge** the new entries into the shipped
 * cassette. Entries already on file are kept byte for byte, so recording v2
 * never re-asks, or overwrites, what v1 was answered.
 *
 *     npm run record -w @craftabot/pack-typesafe -- v2
 *
 * It needs `CRAFTABOT_CREDENTIAL_TYPESAFE` (in `.env`). Never run in CI.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { corpusVersion, writeCalls } from './calls.ts';

const CASSETTE = 'src/cassettes/typesafe-jev.craftabot-cassette.json';

interface Cassette {
	recordedAt: string;
	entries: { argsDigest: string }[];
}

const version = corpusVersion(process.argv[2]);
const calls = writeCalls(version);
const out = `experiment/recording-${version}`;
execFileSync(
	process.execPath,
	[
		'../../harness/dist/main.js',
		'record',
		'--config',
		'craftabot.config.mjs',
		'--line',
		'typesafe/jev',
		'--script',
		calls,
		'--out',
		out
	],
	{ stdio: 'inherit' }
);

const shipped = JSON.parse(readFileSync(CASSETTE, 'utf8')) as Cassette;
const fresh = JSON.parse(
	readFileSync(`${out}/typesafe-jev.craftabot-cassette.json`, 'utf8')
) as Cassette;
const known = new Set(shipped.entries.map((entry) => entry.argsDigest));
const added = fresh.entries.filter((entry) => !known.has(entry.argsDigest));
const merged = {
	...shipped,
	recordedAt: fresh.recordedAt,
	entries: [...shipped.entries, ...added]
};
writeFileSync(CASSETTE, `${JSON.stringify(merged, null, '\t')}\n`);
console.log(
	`merged ${added.length} new entries into ${CASSETTE} (${fresh.entries.length - added.length} already on file; ${merged.entries.length} in all)`
);
