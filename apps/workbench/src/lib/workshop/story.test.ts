import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { EngineEvent, RunRecord } from '@craftabot/core';
import { cassetteName, storyFileName, storyMarkdownOf, storyOfStoredRun } from './story.js';

/** WP161: the Workshop hands the run to the same fold `craftabot story` calls. */
const SAY_HELLO = JSON.parse(
	readFileSync(
		resolve(
			import.meta.dirname,
			'../../../../../packages/packs/starter/src/fixtures/trace.say-hello.v1.json'
		),
		'utf8'
	)
) as EngineEvent[];
const RECORD = {
	id: SAY_HELLO[0]?.runId ?? 'run',
	agentName: 'Snackbot',
	goalCardId: 'starter/say-hello',
	startedAt: '2026-10-02T10:00:00.000Z',
	replayedFrom: {
		cassette: 'docs/evidence/lending-stack/lending-stack.provider-cassette.json',
		model: 'Qwen3.5-122B-A10B-NVFP4',
		recorded: '2026-10-02T09:00:00.000Z'
	}
} as unknown as RunRecord;

describe('the story, for the Workshop', () => {
	it('tells a stored run with its record’s provenance, and renders the markdown the CLI writes', () => {
		const story = storyOfStoredRun(RECORD, SAY_HELLO, []);
		expect(story.subject.title).toBe('Snackbot on starter/say-hello');
		expect(story.facts.map((fact) => fact.value).join(' ')).toContain('not a live call');
		const text = storyMarkdownOf(story);
		expect(text).toContain('# Snackbot on starter/say-hello');
		expect(text).toContain('## How it ended');
		expect(story.ending.outcome).toBe('SUCCESS');
	});

	it('names the file after the run, and a cassette by its own file name', () => {
		expect(storyFileName('abc')).toBe('story-abc.md');
		expect(cassetteName('docs/evidence/x/y.provider-cassette.json')).toBe(
			'y.provider-cassette.json'
		);
		expect(cassetteName('C:\\evidence\\z.json')).toBe('z.json');
		expect(cassetteName('plain.json')).toBe('plain.json');
	});
});
