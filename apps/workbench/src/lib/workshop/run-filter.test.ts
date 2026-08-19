import { describe, expect, it } from 'vitest';
import type { GroupRunRecord, RunRecord } from '@craftabot/core';
import { durationMs, facetsOf, filterRuns, groupRows } from './run-filter.js';

/**
 * The Run Browser's filter, which is the part with the edge cases: an empty
 * filter is not a filter that matches nothing, and a run still in progress has
 * no end to sort or measure.
 */

let seq = 0;
function run(over: Partial<RunRecord> = {}): RunRecord {
	seq += 1;
	return {
		id: `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`,
		agentId: '11111111-1111-4111-8111-111111111111',
		agentName: 'Bolt',
		goalCardId: 'starter/snack',
		specSnapshot: {} as RunRecord['specSnapshot'],
		packVersions: {},
		mode: 'step',
		outcome: 'SUCCESS',
		ticks: 7,
		usage: { inputTokens: 100, outputTokens: 20 },
		budgets: { maxTicks: 30, maxTokens: 8000, requestTimeoutMs: 30_000 },
		providerId: 'mock',
		wireModel: 'mock-1',
		pinned: false,
		startedAt: '2026-08-15T10:00:00.000Z',
		finishedAt: '2026-08-15T10:00:30.000Z',
		schemaVersion: 2,
		...over
	};
}

describe('filtering', () => {
	it('shows everything when nothing is asked for', () => {
		const runs = [run(), run(), run()];
		expect(filterRuns(runs, {})).toHaveLength(3);
	});

	it('narrows by bot, card, outcome and cartridge', () => {
		const runs = [
			run({ agentName: 'Bolt', outcome: 'SUCCESS' }),
			run({ agentName: 'Nut', outcome: 'OUT_OF_STEPS', goalCardId: 'starter/say-hello' }),
			run({ agentName: 'Bolt', outcome: 'SUCCESS', providerId: 'openai' })
		];
		expect(filterRuns(runs, { outcome: 'OUT_OF_STEPS' })).toHaveLength(1);
		expect(filterRuns(runs, { goalCardId: 'starter/say-hello' })).toHaveLength(1);
		expect(filterRuns(runs, { providerId: 'openai' })).toHaveLength(1);
	});

	it('combines filters rather than choosing between them', () => {
		const runs = [
			run({ outcome: 'SUCCESS', providerId: 'openai' }),
			run({ outcome: 'SUCCESS', providerId: 'mock' }),
			run({ outcome: 'ERROR', providerId: 'openai' })
		];
		expect(filterRuns(runs, { outcome: 'SUCCESS', providerId: 'openai' })).toHaveLength(1);
	});

	it('searches the model, not only the cartridge', () => {
		// "Which runs used gpt-4o-mini" is an audit question, and `providerId`
		// alone cannot answer it.
		const runs = [run({ wireModel: 'gpt-4o-mini' }), run({ wireModel: 'mock-1' })];
		expect(filterRuns(runs, { text: 'gpt-4o' })).toHaveLength(1);
	});

	it('finds a run by its id, which is how a bug report arrives', () => {
		const runs = [run(), run()];
		expect(filterRuns(runs, { text: runs[1]!.id })).toHaveLength(1);
	});

	it('ignores whitespace-only search', () => {
		expect(filterRuns([run(), run()], { text: '   ' })).toHaveLength(2);
	});

	it('shows only pinned when asked, and everything when not', () => {
		const runs = [run({ pinned: true }), run({ pinned: false })];
		expect(filterRuns(runs, { pinnedOnly: true })).toHaveLength(1);
		expect(filterRuns(runs, { pinnedOnly: false })).toHaveLength(2);
	});

	it('orders newest first and does not float pinned runs', () => {
		/*
		 * A forensic list orders by fact, not by what somebody starred. The Kit's
		 * scrapbook may reasonably do the opposite — it is a keepsake shelf.
		 */
		const runs = [
			run({ startedAt: '2026-08-01T09:00:00.000Z', pinned: true }),
			run({ startedAt: '2026-08-15T09:00:00.000Z' })
		];
		expect(filterRuns(runs, {})[0]?.startedAt).toBe('2026-08-15T09:00:00.000Z');
	});
});

describe('facets', () => {
	it('are derived from the runs, so a new cartridge needs no code', () => {
		const facets = facetsOf([
			run({ agentName: 'Nut', agentId: 'a2', providerId: 'openai' }),
			run({ agentName: 'Bolt', agentId: 'a1', goalCardId: 'starter/say-hello' })
		]);

		expect(facets.bots.map((b) => b.label)).toEqual(['Bolt', 'Nut']);
		expect(facets.cards).toEqual(['starter/say-hello', 'starter/snack']);
		expect(facets.providers).toEqual(['mock', 'openai']);
	});

	it('offers no filter at all for an empty store', () => {
		// Rather than a set of options that match nothing.
		expect(facetsOf([])).toEqual({ bots: [], cards: [], outcomes: [], providers: [] });
	});

	it('lists a bot once however many runs it has', () => {
		const facets = facetsOf([run(), run(), run()]);
		expect(facets.bots).toHaveLength(1);
	});
});

describe('duration', () => {
	it('is the gap between the two timestamps', () => {
		expect(durationMs(run())).toBe(30_000);
	});

	it('is unknown while a run is still going', () => {
		// Not zero, and not "now minus started": a record written at the start of a
		// run that was then abandoned would otherwise grow a duration for ever.
		expect(durationMs(run({ finishedAt: undefined, outcome: 'IN_PROGRESS' }))).toBeUndefined();
	});
});

describe('grouping (WP29)', () => {
	function groupRun(over: Partial<GroupRunRecord> = {}): GroupRunRecord {
		return {
			id: '99999999-0000-4000-8000-000000000001',
			goalCardId: 'starter/tidy-together',
			memberRunIds: [],
			memberAgentIds: [],
			outcome: 'SUCCESS',
			rounds: 12,
			usage: { inputTokens: 200, outputTokens: 60 },
			pinned: false,
			startedAt: '2026-08-19T10:00:00.000Z',
			finishedAt: '2026-08-19T10:00:12.000Z',
			schemaVersion: 1,
			...over
		};
	}

	it('leaves a solo run’s row exactly as it was — no groupRunId, no grouping', () => {
		const solo = run();
		expect(groupRows([solo], [])).toEqual([{ kind: 'run', run: solo }]);
	});

	it('nests both members under their group’s row, at the first member’s position', () => {
		const robo = run({ id: '00000000-0000-4000-8000-000000000101', groupRunId: groupRun().id });
		const bolt = run({ id: '00000000-0000-4000-8000-000000000102', groupRunId: groupRun().id });
		const rows = groupRows([robo, bolt], [groupRun()]);

		expect(rows).toEqual([{ kind: 'group', group: groupRun(), members: [robo, bolt] }]);
	});

	it('interleaves correctly: a solo run sorted between two different groups’ first members', () => {
		const groupA = groupRun({ id: '99999999-0000-4000-8000-00000000000a' });
		const groupB = groupRun({ id: '99999999-0000-4000-8000-00000000000b' });
		const a1 = run({ id: '00000000-0000-4000-8000-0000000000a1', groupRunId: groupA.id });
		const solo = run({ id: '00000000-0000-4000-8000-0000000000c1' });
		const b1 = run({ id: '00000000-0000-4000-8000-0000000000b1', groupRunId: groupB.id });

		const rows = groupRows([a1, solo, b1], [groupA, groupB]);

		expect(rows.map((row) => row.kind)).toEqual(['group', 'run', 'group']);
	});

	it('a member whose GroupRunRecord is not loaded falls back to its own row', () => {
		const orphan = run({ groupRunId: '99999999-0000-4000-8000-000000000404' });
		expect(groupRows([orphan], [])).toEqual([{ kind: 'run', run: orphan }]);
	});

	it('only nests the members the filter actually passed', () => {
		// `groupRows` is fed `filterRuns`'s own output — simulated here by simply
		// not including Bolt's row, as if a filter had already dropped it.
		const robo = run({ id: '00000000-0000-4000-8000-000000000201', groupRunId: groupRun().id });
		const rows = groupRows([robo], [groupRun()]);

		expect(rows).toEqual([{ kind: 'group', group: groupRun(), members: [robo] }]);
	});
});
