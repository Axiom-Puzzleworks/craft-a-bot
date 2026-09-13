import { describe, expect, it } from 'vitest';
import { journeyLayout } from '@craftabot/workflow';
import { adviceWorkflow } from '@craftabot/pack-fs-advice';
import { fraudWorkflow } from '@craftabot/pack-fs-fraud';
import { lendingWorkflow } from '@craftabot/pack-fs-lending';
import { journeyTwin, stageSentence } from './journey-twin.js';

/**
 * WP100 (`87-JOURNEY-CANVAS.md` §8 item 3; tenet 29): the twin's rows equal
 * the layout's nodes, edges and points — one case per shipped workflow —
 * and a node's sentence carries what its row does.
 */
describe.each([
	['lending', lendingWorkflow],
	['fraud', fraudWorkflow],
	['advice', adviceWorkflow]
])('the %s journey’s twin', (_name, workflow) => {
	const layout = journeyLayout(workflow);
	const twin = journeyTwin(layout);

	it('has one stage row per node, in order, with the node’s facts', () => {
		expect(twin.stages.map((row) => row.stageId)).toEqual(layout.nodes.map((node) => node.stageId));
		for (const [index, node] of layout.nodes.entries()) {
			const row = twin.stages[index]!;
			expect(row.name).toBe(node.name);
			expect(row.irreversible).toBe(node.irreversible);
			expect(row.obligations).toEqual(node.obligations);
			expect(row.guards).toHaveLength(node.guards.length);
			expect(row.status).toBeUndefined();
			expect(row.verdicts).toEqual([]);
		}
	});

	it('has one edge row per edge, in order', () => {
		expect(twin.edges.map((row) => row.id)).toEqual(layout.edges.map((edge) => edge.id));
		for (const [index, edge] of layout.edges.entries()) {
			expect(twin.edges[index]?.label).toBe(edge.label);
			expect(twin.edges[index]?.kind).toBe(edge.kind);
			expect(twin.edges[index]?.taken).toBe(false);
		}
	});

	it('names every point on a node’s row, as its kind', () => {
		for (const node of layout.nodes) {
			const row = twin.stages.find((entry) => entry.stageId === node.stageId)!;
			expect(row.guards).toEqual(
				node.guards.map((id) => layout.points.find((point) => point.id === id)?.kind)
			);
		}
	});

	it('reads each node as a sentence with its name, lane and executor', () => {
		for (const row of twin.stages) {
			const sentence = stageSentence(row);
			expect(sentence).toContain(row.name);
			expect(sentence).toContain(row.lane);
			expect(sentence).toContain(row.executor);
		}
	});
});
