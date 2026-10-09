import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseExperimentResult } from '@craftabot/core';
import { expandExperiment, parseExperiment } from '@craftabot/evals';
import { describe, expect, it } from 'vitest';
import { GATE_CONTENT } from '@craftabot/gate/presets';
import { createRegistry, loadConfig } from '../config.js';
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

/** The defaults and the typesafe pack, as CI's reduced loop runs them (WP119): the eighth design reads through that pack. */
const TYPESAFE_CONFIG = join(HERE, '..', '..', '..', 'packs', 'typesafe', 'craftabot.config.mjs');

describe('the reference experiments', async () => {
	// The typesafe install, and since WP157 the Gate's presets, as CI's loop runs `gate-presets` under the Gate's config.
	const typesafe = await loadConfig(TYPESAFE_CONFIG);
	const registry = createRegistry({ ...typesafe, packs: [...typesafe.packs, GATE_CONTENT] });
	const controlIds = new Set(
		registry.listControlMaps().flatMap((map) => map.rows.map((row) => `${map.id}/${row.ref}`))
	);

	it('are the seventeen campaign-shaped designs, drift-day being the Monitor’s', () => {
		expect(FILES).toEqual([
			'advice-context.json',
			// WP150: the enforced ceilings against Level 5, the components against none, a stack per Phase AA desk.
			'ceilings.json',
			'collections-stack.json',
			'complaints-stack.json',
			'controls.json',
			'disputes-stack.json',
			'fraud-stack.json',
			// WP157: the Gate's five presets as guard levels.
			'gate-presets.json',
			'human-oversight.json',
			'lending-context.json',
			'lending-fairness.json',
			'lending-knobs.json',
			'lending-stack.json',
			'onboarding-stack.json',
			// Plan 114 WP203/WP205: what a desk does with a reply that has no tool call, against the habits the suites measured.
			'reply-contract.json',
			// WP119: the readers on the held-out corpus, through the typesafe pack.
			'servicing-readers.json',
			'servicing-stack.json'
		]);
	});

	it.each(FILES)('%s parses, names listed controls and installed content, and expands', (name) => {
		const experiment = parseExperiment(JSON.parse(readFileSync(join(DIR, name), 'utf8')));
		expect(experiment.id).toBe(name.replace(/\.json$/, ''));
		// What it claims: its own controls, a level's (WP150), and the claims of a stack a guard names.
		const claimed = [
			...experiment.controls,
			...experiment.design.factors.flatMap((factor) => Object.values(factor.controls ?? {}).flat()),
			...experiment.design.template.guards.flatMap((guard) =>
				guard.stack !== undefined ? (registry.getStack(guard.stack)?.controls ?? []) : []
			)
		];
		for (const guard of experiment.design.template.guards)
			if (guard.stack !== undefined)
				expect(registry.getStack(guard.stack), guard.stack).toBeDefined();
		// The eighth measures readers against labels, not a control on the bank's book: it names none (WP119).
		// reply-contract measures a harness mechanism (the contract) under measured habits, not a control on the bank's book (plan 114).
		if (experiment.id === 'servicing-readers' || experiment.id === 'reply-contract')
			expect(claimed).toEqual([]);
		else expect(claimed.length).toBeGreaterThan(0);
		for (const control of claimed) expect(controlIds.has(control), control).toBe(true);
		const source = experiment.design.template.source;
		// WP150's `controls` runs scenarios: its goal cards are installed instead of a workflow.
		if (source === undefined)
			for (const scenario of experiment.design.template.scenarios)
				expect(
					registry.getGoalCard(
						scenario.goalCardId ?? registry.getScenario(scenario.scenarioId ?? '')?.goalCardId ?? ''
					),
					scenario.id
				).toBeDefined();
		const workflow = registry.getWorkflow(source?.workflowId ?? '');
		if (source !== undefined) expect(workflow, name).toBeDefined();
		const configurations = Object.keys(workflow?.configurations ?? {});
		for (const factor of experiment.design.factors) {
			if (factor.axis === 'executors')
				for (const level of factor.levels) expect(configurations, level).toContain(level);
		}
		// An installed assertion card judges as an evaluator too (`31-…` §4.2): the `controls` design names one.
		for (const evaluator of experiment.design.template.evaluators)
			expect(
				registry.getEvaluator(evaluator.id) ?? registry.getAssertionCard(evaluator.id),
				evaluator.id
			).toBeDefined();
		for (const metric of experiment.design.metrics) {
			if (metric.kind === 'evaluator-pass-rate' || metric.kind === 'label-rate')
				expect(registry.getEvaluator(metric.evaluatorId), metric.evaluatorId).toBeDefined();
			if (metric.kind === 'assertion-pass-rate')
				expect(
					experiment.design.template.assertionCards.map((card) => card.id),
					metric.cardId
				).toContain(metric.cardId);
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
