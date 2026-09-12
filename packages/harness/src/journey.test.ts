import { describe, expect, it } from 'vitest';
import { journeyLayout, renderJourneySvg } from '@craftabot/workflow';
import { createRegistry, defaultConfig } from './config.js';

/**
 * WP100 (`87-JOURNEY-CANVAS.md` §8 items 1 and 7): the shipped
 * journeys' layouts and SVGs held byte for byte, and the lending decision
 * fanning out to every outcome it admits — under the default configuration,
 * where the bot decides, and under `bot-recommends`, where a person does.
 */
const registry = createRegistry(defaultConfig());
const workflows = registry.listWorkflows().sort((a, b) => a.id.localeCompare(b.id));

describe('the shipped journeys', () => {
	it('are the six desks’ and the complaints journey (WP102–WP105)', () => {
		expect(workflows.map((workflow) => workflow.id)).toEqual([
			'fs-advice/advice',
			'fs-advice/complaints',
			'fs-collections/arrears',
			'fs-disputes/disputes',
			'fs-fraud/fraud',
			'fs-lending/lending',
			'fs-onboarding/onboarding'
		]);
	});

	it.each(workflows.map((workflow) => [workflow.id, workflow] as const))(
		'%s lays out byte-stably, and its SVG with it',
		async (id, workflow) => {
			const layout = journeyLayout(workflow, undefined, undefined, { registry });
			expect(layout).toEqual(journeyLayout(workflow, undefined, undefined, { registry }));
			const slug = id.replace('/', '-');
			await expect(JSON.stringify(layout, null, '\t') + '\n').toMatchFileSnapshot(
				`./__snapshots__/journey-${slug}.json`
			);
			await expect(renderJourneySvg(layout)).toMatchFileSnapshot(
				`./__snapshots__/journey-${slug}.svg`
			);
		}
	);

	it('fans the lending decision out to approve, decline and refer — the bot’s, and a person’s under bot-recommends', () => {
		const lending = registry.getWorkflow('fs-lending/lending');
		if (!lending) throw new Error('no lending journey');
		const labels = (layout: ReturnType<typeof journeyLayout>) =>
			layout.edges
				.filter((edge) => edge.from === 'decision')
				.flatMap((edge) => edge.label.split(' / '))
				.sort();
		expect(labels(journeyLayout(lending))).toEqual(['approve', 'decline', 'refer']);
		const recommends = journeyLayout(lending, lending.configurations?.['bot-recommends']);
		expect(labels(recommends)).toEqual(['approve', 'decline', 'refer']);
		expect(recommends.nodes.find((node) => node.stageId === 'decision')?.lane).toBe('colleague');
		expect(journeyLayout(lending).nodes.find((node) => node.stageId === 'decision')?.lane).toBe(
			'assistant'
		);
	});

	it('draws the fraud journey’s handoff to complaints as an exit (WP102)', () => {
		const fraud = registry.getWorkflow('fs-fraud/fraud');
		if (!fraud) throw new Error('no fraud journey');
		const layout = journeyLayout(fraud, undefined, undefined, { registry });
		// The note's `next` reads the desk, so the enumeration draws the case edge; a lit run adds the exit it took.
		expect(layout.edges.find((edge) => edge.from === 'note')?.kind).toBe('case');
	});

	it('draws every configuration of every journey without a throw', () => {
		for (const workflow of workflows) {
			for (const config of Object.values(workflow.configurations ?? {})) {
				expect(() => journeyLayout(workflow, config, undefined, { registry })).not.toThrow();
			}
		}
	});
});
