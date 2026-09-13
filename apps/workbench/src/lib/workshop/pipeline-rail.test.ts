import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { journeyLayout } from '@craftabot/workflow';
import { describe, expect, it } from 'vitest';
import { journeyTwin } from '$lib/control-room/journey-twin.js';
import { createRegistry } from '$lib/packs.js';

/**
 * WP110 (`97-ACCESS.md` §3): the Pipeline rail's cards equal the Journey
 * List's rows — the rail draws the run's stage records, the twin the
 * layout lit by the same run; every card has a row with the same status,
 * and every lit row a card.
 */
const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(
	HERE,
	'..',
	'..',
	'..',
	'..',
	'..',
	'packages',
	'packs',
	'fs-lending',
	'src',
	'fixtures',
	'lending-workflow-run.v1.json'
);

describe('the Pipeline rail and its twin', () => {
	it('draw the same stages with the same status, in the same order', () => {
		const stored = JSON.parse(readFileSync(FIXTURE, 'utf8')) as {
			run: { workflowId: string; stages: { stageId: string; status: string }[] };
		};
		const registry = createRegistry();
		const workflow = registry.getWorkflow(stored.run.workflowId);
		expect(workflow).toBeDefined();
		const layout = journeyLayout(workflow!, undefined, stored.run as never, { registry });
		const twin = journeyTwin(layout, stored.run as never);
		const cards = stored.run.stages.map((record) => `${record.stageId}:${record.status}`);
		const rows = twin.stages
			.filter((row) => row.status !== undefined)
			.map((row) => `${row.stageId}:${row.status}`);
		expect(rows).toEqual(cards);
	});
});
