import { describe, expect, it } from 'vitest';
import type { LLMProvider, PackManifest } from '@craftabot/core';
import { createMockProvider } from '@craftabot/core/testing';
import workshopPack from '@craftabot/pack-workshop';
import { injectionBaseline } from './baseline-campaign.js';
import { scriptedOptimal } from './brains.js';
import { parseCampaign, runCampaign, specFor } from './campaign.js';
import { starterPlans } from './plans.js';

/**
 * **A live brain thinks with the cartridge it names** (`99-DGX-SPARK.md` §9):
 * found on 2026-10-04 by recording a bank design through the DGX Sparks, where a
 * live book cell asked its provider for the model `"mock"` because the brain's
 * `cartridgeId` never reached the agent's brain slot. The request's model comes
 * from the spec's brain cartridge, so the campaign applies the live brain's.
 */
const WIRE_MODEL = 'the-wire-model';
const modelPack: PackManifest = {
	id: 'modelpack',
	name: 'Model pack',
	version: '1.0.0',
	requiresCore: '>=1.0.0',
	cartridges: [
		{
			id: 'modelpack/big',
			providerId: 'modelpack',
			model: WIRE_MODEL,
			displayName: 'Big',
			blurb: 'A cartridge whose model is not "mock".',
			stats: { words: 1, reasoning: 1, speed: 1 },
			costHint: 'low',
			defaults: { temperature: 0, maxTokens: 256 }
		}
	]
};

function campaignWith(brain: Record<string, unknown>) {
	const base = injectionBaseline([1]) as Record<string, unknown> & { guards: unknown[] };
	return parseCampaign({
		...base,
		scenarios: (base['scenarios'] as unknown[]).slice(0, 1),
		guards: base.guards.slice(0, 1),
		brains: [brain],
		budget: { maxLiveCells: 100 }
	});
}

describe('a live brain’s cartridge reaches the cell (2026-10-04)', () => {
	it('puts the brain’s cartridge on the spec’s brain slot, and only for a live brain', () => {
		const campaign = campaignWith({ id: 'live', tier: 'live', cartridgeId: 'modelpack/big' });
		const cell = {
			scenario: campaign.scenarios[0]!,
			build: campaign.builds[0]!,
			guard: campaign.guards[0]!
		};
		const cartridgeOf = (spec: ReturnType<typeof specFor>) =>
			(spec.bricks.find((brick) => brick.slot === 'brain')?.config as { cartridgeId?: string })
				.cartridgeId;
		expect(cartridgeOf(specFor({ ...cell, brain: campaign.brains[0]! }))).toBe('modelpack/big');
		// A scripted brain, or a cell with no brain named, leaves the spec as the build made it.
		const scripted = { id: 's', tier: 'scripted-optimal' as const };
		expect(cartridgeOf(specFor({ ...cell, brain: scripted }))).toBe(cartridgeOf(specFor(cell)));
	});

	it('asks the provider for the cartridge’s model, not the default', async () => {
		const asked: string[] = [];
		const campaign = campaignWith({ id: 'live', tier: 'live', cartridgeId: 'modelpack/big' });
		const report = await runCampaign(campaign, {
			packs: [workshopPack, modelPack],
			providerFor: (_brain, context) => {
				const inner = createMockProvider({
					script: scriptedOptimal(starterPlans.planFor(context?.goalCardId ?? ''))
				});
				const spy: LLMProvider = {
					...inner,
					chat: (request, options) => {
						asked.push(request.model);
						return inner.chat(request, options);
					}
				};
				return spy;
			}
		});
		expect(report.cells.length).toBeGreaterThan(0);
		expect(asked.length).toBeGreaterThan(0);
		expect(new Set(asked)).toEqual(new Set([WIRE_MODEL]));
	});
});
