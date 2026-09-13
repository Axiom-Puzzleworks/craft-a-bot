import { workflowRunSchema, type AgentSpec, type PackManifest } from '@craftabot/core';
import { createMockProvider, createTestClock, obedient } from '@craftabot/core/testing';
import { parseCampaign } from '@craftabot/evals';
import starterPack from '@craftabot/pack-starter';
import { runWorkflow } from '@craftabot/workflow';
import { describe, expect, it } from 'vitest';
import vetPracticePack from '../../vet-practice/src/index.js';
import vaccinationPack, {
	VACCINATION_CONFIGURATIONS,
	vaccinationBaseline,
	vaccinationBook,
	vaccinationDesk,
	vaccinationWorkflow
} from './index.js';
import { planFor } from './testing/plans.js';

/**
 * The scaffold's golden run and book (`93-DOMAIN-PACK.md` §4): the book
 * draws from the seed, the journey runs `rules-only` and at Level 4 over
 * its first item to the same decision, byte-stably, and the campaign parses.
 */
const CARTRIDGES: PackManifest = {
	id: 'test',
	name: 'Test cartridges',
	version: '1.0.0',
	requiresCore: '>=1.0.0',
	cartridges: [
		{
			id: 'test/mock-brain',
			providerId: 'mock',
			model: 'mock-1',
			displayName: 'Mock Brain',
			blurb: 'Scripted.',
			stats: { words: 2, reasoning: 2, speed: 3 },
			costHint: 'low',
			defaults: { temperature: 0, maxTokens: 256 }
		}
	]
};
const PACKS = [starterPack, vetPracticePack, vaccinationPack, CARTRIDGES];
const SPEC: AgentSpec = {
	id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
	name: 'Deskbot',
	bricks: {
		llm: {
			cartridgeId: 'test/mock-brain',
			temperature: 0,
			maxTokens: 256,
			personality: 'You are the assistant.'
		},
		sense: { channels: vaccinationDesk.senses.map((sense) => sense.id) },
		actions: { enabled: vaccinationDesk.actions.map((action) => action.id) },
		memory: { windowSize: 10, notebook: true }
	},
	goalCardId: 'vaccination/a-case',
	createdAt: '2026-01-01T09:00:00Z',
	updatedAt: '2026-01-01T09:00:00Z',
	schemaVersion: 1
};

const run = (configuration: keyof typeof VACCINATION_CONFIGURATIONS) => {
	const clock = createTestClock();
	const seat = createTestClock({ idOffset: 500 });
	return runWorkflow(vaccinationWorkflow, vaccinationBook({ seed: 1, size: 3 }).items[0]!, {
		packs: PACKS,
		spec: SPEC,
		config: VACCINATION_CONFIGURATIONS[configuration],
		providerFor: (_stage, goalCardId) =>
			createMockProvider({ script: obedient(planFor(goalCardId)) }),
		now: clock.now,
		newId: clock.newId,
		random: clock.random,
		session: { now: seat.now, newId: seat.newId, random: seat.random }
	});
};

describe('the Vaccination journey (scaffolded)', () => {
	it('draws a book from the seed, byte-stably', () => {
		const book = vaccinationBook({ seed: 1, size: 5 });
		expect(book.items).toHaveLength(5);
		expect(
			book.items.every((item) => String(item.truth.facts?.['verdict']).startsWith('should-'))
		).toBe(true);
		expect(JSON.stringify(vaccinationBook({ seed: 1, size: 5 }))).toBe(JSON.stringify(book));
	});

	it('runs rules-only and at Level 4 to the same decision — the golden run', async () => {
		const rules = await run('rules-only');
		const level4 = await run('bot-with-a-person-at-the-close');
		for (const made of [rules, level4]) {
			expect(made.outcome).toBe('completed');
			expect(made.stages.map((stage) => stage.stageId)).toEqual([
				'intake',
				'review',
				'decision',
				'confirm',
				'close'
			]);
			expect(workflowRunSchema.safeParse(JSON.parse(JSON.stringify(made))).success).toBe(true);
		}
		const outcome = (made: typeof rules) =>
			(made.stages.at(-1)?.output.value as { outcome?: string }).outcome;
		expect(outcome(rules)).toBe(outcome(level4));
		expect(rules.runIds).toEqual([]);
		expect(level4.runIds).toHaveLength(2);
		expect(JSON.stringify(await run('rules-only'))).toBe(JSON.stringify(rules));
	});

	it('ships a campaign that parses', () => {
		const campaign = parseCampaign(vaccinationBaseline());
		expect(campaign.scenarios).toHaveLength(2);
		expect(campaign.gates).toHaveLength(3);
	});
});
