import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { EngineEvent } from '@craftabot/core';
import { looksLikeSinkLines, parseSinkLines } from './sink-import.js';

/**
 * The file sink's lines as a run (WP68, `57-…` §4.5): a run still going
 * comes back provisional and `IN_PROGRESS`; the same file with its
 * `run.finished` line comes back finished; a record line is honoured; a
 * group's export is refused; rubbish lines are counted, not fatal.
 */
const HERE = dirname(fileURLToPath(import.meta.url));
const golden = JSON.parse(
	readFileSync(
		join(
			HERE,
			'..',
			'..',
			'..',
			'..',
			'..',
			'packages',
			'packs',
			'starter',
			'src',
			'fixtures',
			'trace.say-hello.v1.json'
		),
		'utf8'
	)
) as EngineEvent[];
const lines = (events: readonly EngineEvent[]) =>
	events.map((event) => JSON.stringify(event)).join('\n') + '\n';

describe('parseSinkLines', () => {
	it('reads a run still being written as provisional and in progress', () => {
		const partial = golden.filter((event) => event.type !== 'run.finished');
		const imported = parseSinkLines(lines(partial));
		expect(imported.inProgress).toBe(true);
		expect(imported.run.outcome).toBe('IN_PROGRESS');
		expect(imported.run.id).toBe(golden[0]?.runId);
		expect(imported.events).toHaveLength(partial.length);
		expect(imported.skipped).toBe(0);
	});

	it('reads the finished file as finished, and honours a record line when there is one', () => {
		const whole = parseSinkLines(lines(golden));
		expect(whole.inProgress).toBe(false);
		expect(whole.run.outcome).toBe('SUCCESS');
		const record = { ...whole.run, agentName: 'Exported Name' };
		const withRecord = parseSinkLines(
			`${JSON.stringify({ kind: 'run', record })}\n${lines(golden)}`
		);
		expect(withRecord.run.agentName).toBe('Exported Name');
		expect(withRecord.events).toHaveLength(golden.length);
	});

	it('counts a line it cannot read, refuses a group export and an empty file', () => {
		expect(parseSinkLines(`not json\n${lines(golden)}`).skipped).toBe(1);
		expect(() => parseSinkLines(`${JSON.stringify({ kind: 'group', record: {} })}\n`)).toThrow(
			/group episode/
		);
		expect(() => parseSinkLines('\n\n')).toThrow(/No events/);
	});

	it('tells the sink’s lines from a trace file', () => {
		expect(looksLikeSinkLines(lines(golden))).toBe(true);
		expect(looksLikeSinkLines(JSON.stringify({ format: 'craftabot-trace', events: [] }))).toBe(
			false
		);
		expect(looksLikeSinkLines('')).toBe(false);
		expect(looksLikeSinkLines('nope')).toBe(false);
	});
});
