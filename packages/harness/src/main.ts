#!/usr/bin/env node
import { main } from './cli.js';

/*
 * Exit status via `process.exitCode`, never `process.exit()`: on Windows an
 * explicit exit while undici still holds a socket in teardown trips a libuv
 * assertion and the process dies with a native crash instead of the tidy
 * failure it just printed (`packages/packs/openai/scripts/smoke.ts` found
 * this first).
 *
 * A closed pipe is not an error either: `craftabot bundle … | head` closes
 * stdout early, and a CLI that crashes with a stack trace for that is one
 * nobody wants in a shell pipeline.
 */
process.stdout.on('error', (error: NodeJS.ErrnoException) => {
	if (error.code === 'EPIPE') process.exitCode = 0;
	else throw error;
});

process.exitCode = await main(process.argv.slice(2), {
	stdout: (text) => process.stdout.write(text),
	stderr: (text) => process.stderr.write(text),
	env: process.env
});
