import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseExperimentResult } from '@craftabot/core';
import { expandExperiment, parseExperiment } from '@craftabot/evals';
import { describe, expect, it } from 'vitest';
import { createRegistry, defaultConfig } from '../config.js';
import { withPopulationSize } from './experiment.js';

/**
 * **The reference experiments** (WP90, `80-…` §4–§5): every file under
 * `experiments/` parses as a design, names controls the registry's control
 * maps list, refers to guards, configurations, contexts and evaluators the
 * installed packs ship, and expands to campaigns sharing seeds; `--size`
 * resizes a design's population and refuses one with its book inline.
 */
const HERE = dirname(fileURLToPath(import.meta.url));
const DIR = join(HERE, '..', '..', '..', '..', 'experiments');
const EVIDENCE = join(HERE, '..', '..', '..', '..', 'docs', 'evidence');
const FILES = readdirSync(DIR)
	.filter((name) => name.endsWith('.json'))
	.sort();

describe('the reference experiments', () => {
	const registry = createRegistry(defaultConfig());
	const controlIds = new Set(
		registry.listControlMaps().flatMap((map) => map.rows.map((row) => `${map.id}/${row.ref}`))
	);

	it('are the seven campaign-shaped designs, drift-day being the Monitor’s', () => {
		expect(FILES).toEqual([
			'advice-context.json',
			'fraud-stack.json',
			'human-oversight.json',
			'lending-context.json',
			'lending-fairness.json',
			'lending-knobs.json',
			'lending-stack.json'
		]);
	});

	it.each(FILES)('%s parses, names listed controls and installed content, and expands', (name) => {
		const experiment = parseExperiment(JSON.parse(readFileSync(join(DIR, name), 'utf8')));
		expect(experiment.id).toBe(name.replace(/\.json$/, ''));
		expect(experiment.controls.length).toBeGreaterThan(0);
		for (const control of experiment.controls) expect(controlIds.has(control), control).toBe(true);
		const workflow = registry.getWorkflow(experiment.design.template.source?.workflowId ?? '');
		expect(workflow, name).toBeDefined();
		const configurations = Object.keys(workflow?.configurations ?? {});
		for (const factor of experiment.design.factors) {
			if (factor.axis === 'executors')
				for (const level of factor.levels) expect(configurations, level).toContain(level);
		}
		for (const evaluator of experiment.design.template.evaluators)
			expect(registry.getEvaluator(evaluator.id), evaluator.id).toBeDefined();
		for (const metric of experiment.design.metrics) {
			if (metric.kind === 'evaluator-pass-rate' || metric.kind === 'label-rate')
				expect(registry.getEvaluator(metric.evaluatorId), metric.evaluatorId).toBeDefined();
		}
		const { campaigns } = expandExperiment(experiment);
		expect(campaigns.length).toBeGreaterThanOrEqual(2);
		for (const campaign of campaigns) expect(campaign.seeds).toEqual(campaigns[0]?.seeds);
	});

	it('resizes a population for a shape run and refuses a design with its book inline', () => {
		const experiment = parseExperiment(
			JSON.parse(readFileSync(join(DIR, 'lending-stack.json'), 'utf8'))
		);
		const small = withPopulationSize(experiment, 200);
		expect(small.design.template.source?.population?.size).toBe(200);
		expect(experiment.design.template.source?.population?.size).toBe(10000);
		const inline = {
			...experiment,
			design: {
				...experiment.design,
				template: {
					...experiment.design.template,
					source: {
						kind: 'book' as const,
						workflowId: 'fs-lending/lending',
						book: { schemaVersion: 1, kind: 'loan-application', items: [] } as never
					}
				}
			}
		};
		expect(() => withPopulationSize(inline, 200)).toThrow('carries its book inline');
		expect(() =>
			withPopulationSize(
				{
					...experiment,
					design: {
						...experiment.design,
						template: { ...experiment.design.template, source: undefined }
					}
				},
				200
			)
		).toThrow('runs scenarios');
	});

	it('the committed human-oversight result: touches per case fall from Level 3 to Level 5 and the breach rate rises (`80-…` §5)', () => {
		const result = parseExperimentResult(
			JSON.parse(
				readFileSync(
					join(EVIDENCE, 'human-oversight', 'human-oversight.experiment-result.json'),
					'utf8'
				)
			)
		);
		const touchesAt = (level: string): number => {
			const effect = result.effects.find(
				(entry) =>
					entry.metricId === 'touches' &&
					entry.factor.axis === 'executors' &&
					entry.factor.treatment === level
			);
			if (!effect) throw new Error(`no touches effect for ${level}`);
			return effect.treatment.value;
		};
		const breachesAt = (level: string): number => {
			const effect = result.effects.find(
				(entry) =>
					entry.metricId === 'breaches' &&
					entry.factor.axis === 'executors' &&
					entry.factor.treatment === level
			);
			if (!effect) throw new Error(`no breaches effect for ${level}`);
			return effect.treatment.value;
		};
		// Level 3 → 4 → 5: bot-recommends, bot-with-a-person-at-the-decision, bot-everywhere.
		expect(touchesAt('bot-recommends')).toBeGreaterThan(
			touchesAt('bot-with-a-person-at-the-decision')
		);
		expect(touchesAt('bot-with-a-person-at-the-decision')).toBeGreaterThan(
			touchesAt('bot-everywhere')
		);
		expect(breachesAt('bot-recommends')).toBe(0);
		expect(breachesAt('bot-with-a-person-at-the-decision')).toBeGreaterThan(0);
		expect(breachesAt('bot-everywhere')).toBeGreaterThan(
			breachesAt('bot-with-a-person-at-the-decision')
		);
		// Every committed result verifies against its digest and names its workflow.
		for (const id of [
			'lending-stack',
			'lending-context',
			'lending-fairness',
			'lending-knobs',
			'fraud-stack',
			'advice-context',
			'human-oversight'
		]) {
			const committed = parseExperimentResult(
				JSON.parse(readFileSync(join(EVIDENCE, id, `${id}.experiment-result.json`), 'utf8'))
			);
			expect(committed.experimentId).toBe(id);
			expect(committed.workflowIds?.length).toBe(1);
		}
	});
});
