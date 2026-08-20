import { migrateAgentSpec, type AgentSpecV2 } from '@craftabot/core';
import { obedient } from '@craftabot/core/testing';
import { describe, expect, it } from 'vitest';
import { buildSpec, runToCompletion } from './harness.js';

/**
 * **The Librarian brick's own tools, over a real session** (WP32 stage A).
 *
 * `starter/say-hello` is used throughout — the mechanism under test (a
 * memory-slot brick offering per-book tools) has nothing to do with the
 * Playroom's own layout, unlike If/Then's own `if-then.test.ts`, so there is
 * no reason to need a card with anything to see.
 */

function librarianSpec(books: string[]): AgentSpecV2 {
	const migrated = migrateAgentSpec(buildSpec({ goalCardId: 'starter/say-hello', memory: null }));
	if ('kind' in migrated) throw new Error(migrated.message);
	migrated.bricks.push({
		slot: 'memory',
		kind: 'starter/librarian',
		config: { windowSize: 10, notebook: false, books },
		configVersion: 1
	});
	return migrated;
}

describe('the Librarian brick, over a real session', () => {
	it('answers a question its own configured book can answer', async () => {
		const run = await runToCompletion({
			script: obedient([
				{
					say: 'Let me ask the games book.',
					call: 'library_games',
					args: { query: 'how do you play hide and seek?' }
				}
			]),
			spec: librarianSpec(['games']),
			maxTicks: 1
		});

		const executed = run.byType('tool.executed');
		expect(executed).toHaveLength(1);
		expect(executed[0]).toMatchObject({
			type: 'tool.executed',
			payload: { name: 'library_games', result: expect.stringContaining('shelf') }
		});
	});

	it('never offers a book that was not configured — the tool simply is not on the belt', async () => {
		const run = await runToCompletion({
			script: obedient([
				{
					say: 'Let me try the history book anyway.',
					call: 'library_history',
					args: { query: 'the toy chest' }
				}
			]),
			spec: librarianSpec(['games']),
			maxTicks: 1
		});

		// Never offered means never dispatched as a tool at all — the mock
		// brain's own scripted call still names it, but nothing in the trace
		// records it having actually run.
		expect(run.byType('tool.executed')).toHaveLength(0);
		expect(run.byType('decision')[0]).toMatchObject({
			type: 'decision',
			payload: { call: { name: 'library_history' } }
		});
	});

	it('answers nothing for a question its own book cannot answer', async () => {
		const run = await runToCompletion({
			script: obedient([
				{ say: 'Odd question.', call: 'library_games', args: { query: 'the capital of France' } }
			]),
			spec: librarianSpec(['games']),
			maxTicks: 1
		});

		expect(run.byType('tool.executed')[0]).toMatchObject({
			type: 'tool.executed',
			payload: { result: expect.stringContaining('nothing to say') }
		});
	});

	it('keeps the same turn-window memory a Scrapbook-fitted bot gets', async () => {
		const run = await runToCompletion({
			script: obedient([
				{ say: 'One.', call: 'say', args: { text: 'One' } },
				{ say: 'Two.', call: 'say', args: { text: 'Two' } }
			]),
			spec: librarianSpec([]),
			maxTicks: 2
		});

		// The core-owned memory-slot machinery runs regardless of which kind is
		// fitted (`slot-contracts.ts`) — this is what proves Librarian's config
		// really does satisfy `memorySlotSchema`, not just parse against its own.
		expect(run.byType('memory.updated').length).toBeGreaterThan(0);
	});

	it('offers a tool per configured book, in one call each', async () => {
		const run = await runToCompletion({
			script: obedient([
				{
					say: 'Games first.',
					call: 'library_games',
					args: { query: 'counting' }
				},
				{
					say: 'Then history.',
					call: 'library_history',
					args: { query: 'the toy chest' }
				}
			]),
			spec: librarianSpec(['games', 'history']),
			maxTicks: 2
		});

		const names = run.byType('tool.executed').map((event) => {
			if (event.type !== 'tool.executed') throw new Error('unreachable');
			return event.payload.name;
		});
		expect(names).toEqual(['library_games', 'library_history']);
	});
});
