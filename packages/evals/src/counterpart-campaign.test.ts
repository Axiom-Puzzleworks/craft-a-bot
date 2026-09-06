import { describe, expect, it } from 'vitest';
import { createMockProvider } from '@craftabot/core/testing';
import workshopPack from '@craftabot/pack-workshop';
import { planFor as workshopPlanFor } from '@craftabot/pack-workshop/testing';
import { chainPlans, noPlans, starterPlans } from './plans.js';
import { scriptedCounterpart } from './brains.js';
import { counterpartScriptFor, counterpartSpec, deskFor } from './counterpart-seat.js';
import { evaluateGate, parseCampaign, runCampaign, type Campaign } from './campaign.js';
import { registryForScenario } from './scenarios.js';

/**
 * A live-seat campaign (WP64, `56-…` §4.1–4.2, §11 items 1–2): the Front
 * Desk's card with a second seat driven by a mock provider standing in for
 * a model — the desk's own script through `scriptedCounterpart`, so the
 * episode is deterministic while the plumbing is the live seat's. The
 * report and every cell say `live`; no budget refuses; a `no-regression`
 * gate against a scripted-seat baseline says the instruments differ.
 */
const CARD = 'workshop/sign-the-visitor-in';
const plans = chainPlans(starterPlans, {
	planFor: workshopPlanFor,
	adversaryPlanFor: noPlans('adversarial')
});

function campaign(over: Partial<Campaign> = {}): Campaign {
	return parseCampaign({
		schemaVersion: 1,
		id: 'test/front-desk-live',
		title: 'The Front Desk with a live seat',
		scenarios: [{ id: 'sign-in', goalCardId: CARD, maxTicks: 8 }],
		builds: [
			{
				id: 'clerk',
				base: { kind: 'starter-default' },
				overrides: {
					senses: [
						'workshop/the-desk/conversation',
						'workshop/the-desk/case-file',
						'workshop/the-desk/queue'
					],
					actions: [
						'workshop/the-desk/say',
						'workshop/the-desk/look-up',
						'workshop/the-desk/sign-in',
						'workshop/the-desk/decide'
					]
				}
			}
		],
		guards: [{ id: 'none', fit: [] }],
		brains: [{ id: 'scripted-optimal', tier: 'scripted-optimal' }],
		seeds: [1, 2],
		assertionCards: [],
		evaluators: [],
		gates: [{ id: 'finishes', require: { kind: 'outcome-rate', outcome: 'SUCCESS', atLeast: 0 } }],
		counterpart: { tier: 'live', cartridgeId: 'starter/demo', maxRounds: 12 },
		budget: { maxLiveCells: 4 },
		...over
	});
}

/** A mock in the seat: the desk's own script, read from the world the cell made, as a model would be briefed. */
const seatProvider = (registry = registryForScenario([workshopPack])) => {
	const { card, world } = deskFor(registry, CARD);
	const script = counterpartScriptFor(registry, CARD, world.create(card.layoutId, {})).script;
	return createMockProvider({
		id: 'mock-seat',
		script: scriptedCounterpart(script, { selfName: script.name })
	});
};

describe('a live-seat campaign (WP64)', () => {
	it('runs two-seat cells, scores the agent’s own trace, and labels the instrument live', async () => {
		const seen: Array<{ runIds: Set<string>; agentRunId?: string }> = [];
		const report = await runCampaign(campaign(), {
			packs: [workshopPack],
			plans,
			providerFor: (brain) => {
				expect(brain).toMatchObject({
					id: 'counterpart',
					tier: 'live',
					cartridgeId: 'starter/demo'
				});
				return seatProvider();
			},
			onTrace: (cell, trace) =>
				seen.push({
					runIds: new Set(trace.events.map((event) => event.runId)),
					...(cell.runId ? { agentRunId: cell.runId } : {})
				})
		});
		expect(report.counterpart).toEqual({
			tier: 'live',
			cartridgeId: 'starter/demo',
			maxRounds: 12
		});
		expect(report.cells).toHaveLength(2);
		for (const cell of report.cells) {
			expect(cell.error).toBeUndefined();
			expect(cell.counterpart).toMatchObject({
				tier: 'live',
				cartridgeId: 'starter/demo',
				name: expect.any(String)
			});
			expect(cell.counterpart?.runId).toBeDefined();
			expect(cell.counterpart?.runId).not.toBe(cell.runId);
			expect(cell.outcome).toBeDefined();
			expect(cell.runId).toBeDefined();
		}
		// The trace handed out is the merged stream — both seats — while the cell was scored on the agent's run alone.
		expect(seen).toHaveLength(2);
		for (const trace of seen) {
			expect(trace.runIds.size).toBeGreaterThanOrEqual(2);
			expect(trace.runIds.has(trace.agentRunId ?? '')).toBe(true);
		}
		expect(report.budget.liveCells).toBe(2);
		expect(report.passed).toBe(true);
	});

	it('refuses a live seat without a budget or a cartridge, and a scripted campaign says scripted', async () => {
		await expect(
			runCampaign(campaign({ budget: undefined }), { packs: [workshopPack], plans })
		).rejects.toThrow(/no budget/);
		await expect(
			runCampaign(campaign({ counterpart: { tier: 'live' } }), { packs: [workshopPack], plans })
		).rejects.toThrow(/names no cartridgeId/);
		await expect(
			runCampaign(campaign({ budget: { maxLiveCells: 1 } }), {
				packs: [workshopPack],
				plans,
				providerFor: () => seatProvider()
			})
		).rejects.toThrow(/budget allows 1/);
		const scripted = await runCampaign(campaign({ counterpart: undefined, budget: undefined }), {
			packs: [workshopPack],
			plans
		});
		// A scripted report says so on its face; its cells carry nothing, as every cell before WP64 did.
		expect(scripted.counterpart).toEqual({ tier: 'scripted' });
		expect(scripted.cells.every((cell) => cell.counterpart === undefined)).toBe(true);
		expect(scripted.budget.liveCells).toBe(0);
	});

	it('a no-regression gate refuses to compare a live-seat report with a scripted-seat baseline', async () => {
		const scripted = await runCampaign(campaign({ counterpart: undefined, budget: undefined }), {
			packs: [workshopPack],
			plans
		});
		const live = await runCampaign(campaign(), {
			packs: [workshopPack],
			plans,
			providerFor: () => seatProvider()
		});
		const gate = {
			id: 'holds',
			require: { kind: 'no-regression' as const, tolerance: 0 }
		};
		const verdict = evaluateGate(gate, live.cells, scripted, {
			counterpart: live.counterpart ?? { tier: 'scripted' }
		});
		expect(verdict).toMatchObject({ passed: true, inconclusive: true });
		expect(verdict.required).toContain('not comparable');
		expect(verdict.required).toContain('scripted');
		expect(verdict.required).toContain('live');
		// The same instrument compares as before.
		const same = evaluateGate(gate, live.cells, live, {
			counterpart: live.counterpart ?? { tier: 'scripted' }
		});
		expect(same.inconclusive).toBeUndefined();
	});

	it('the seat’s spec is the visitor: the conversation and its brief, say and hang-up, the persona as its personality', () => {
		const registry = registryForScenario([workshopPack]);
		const { script, world } = counterpartScriptFor(registry, CARD);
		const spec = counterpartSpec(
			script,
			CARD,
			world.id,
			'starter/demo',
			'seat-1',
			'2026-09-06T09:00:00.000Z'
		);
		expect(spec.bricks.llm?.personality).toBe(script.persona);
		expect(spec.bricks.actions?.enabled).toEqual([`${world.id}/say`, `${world.id}/hang-up`]);
		expect(spec.bricks.sense?.channels).toEqual([`${world.id}/conversation`, `${world.id}/brief`]);
		expect(() => counterpartScriptFor(registry, 'starter/say-hello')).toThrow(/needs a desk/);
	});
});
