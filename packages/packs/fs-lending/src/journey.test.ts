import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseWorkflowRun } from '@craftabot/core';
import { journeyLayout } from '@craftabot/workflow';
import { LENDING_CONFIGURATIONS, lendingWorkflow } from './index.js';

/**
 * WP100 (`87-JOURNEY-CANVAS.md` §8 item 2): the lit path over the golden
 * lending workflow run equals its stage records, every consecutive pair is
 * joined by a lit edge, and the run's executors put the stages on their
 * lanes.
 */
const fixture = JSON.parse(
	readFileSync(new URL('./fixtures/lending-workflow-run.v1.json', import.meta.url), 'utf8')
) as { run: unknown };
const run = parseWorkflowRun(fixture.run);

describe('the lending journey lit by the golden run', () => {
	const layout = journeyLayout(
		lendingWorkflow,
		LENDING_CONFIGURATIONS['bot-with-a-person-at-the-decision'],
		run
	);

	it('lights the stage records’ path, edge by edge', () => {
		expect(layout.lit?.path).toEqual(run.stages.map((stage) => stage.stageId));
		expect(layout.lit?.edges).toHaveLength(run.stages.length);
		for (const [index, id] of (layout.lit?.edges ?? []).entries()) {
			const edge = layout.edges.find((entry) => entry.id === id);
			expect(edge?.taken, id).toBe(true);
			expect(edge?.from).toBe(run.stages[index]?.stageId);
		}
		// The decision declined and four eyes confirmed: the run ended after four-eyes, an edge the enumeration could not foresee.
		expect(layout.lit?.edges.at(-1)).toBe('four-eyes->end');
		expect(layout.edges.find((edge) => edge.id === 'four-eyes->end')?.kind).toBe('observed');
		expect(layout.edges.find((edge) => edge.id === 'decision->record')?.taken).toBe(true);
	});

	it('puts every stage on the lane of the executor the run recorded', () => {
		for (const record of run.stages) {
			const node = layout.nodes.find((entry) => entry.stageId === record.stageId);
			expect(node?.executor, record.stageId).toBe(record.executor.kind);
		}
	});
});
