import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { EngineEvent } from '@craftabot/core';
import {
	campaignSchema,
	componentFitsFor,
	injectionBaseline,
	runCampaign,
	type Campaign,
	type CampaignReport
} from '@craftabot/evals';
import { createRegistry, defaultConfig } from './config.js';
import { harnessPlans } from './plans.js';

/**
 * **The component identity test** (WP94, `85-COMPONENTS.md` §6): every
 * campaign the repo ships, run as the bricks it fits and run again with
 * those bricks translated to components, gives the same `guardrail.checked`
 * sequence in every cell — `{guardrailId, hook, verdict, policyCardId}`,
 * tick by tick. The component path adds its annotations (`componentId`,
 * `point`) and changes nothing else. This is what lets Day 6 build stacks
 * from components without a second guardrail runtime.
 */

const ROOT = resolve(import.meta.dirname, '../../..');
const config = defaultConfig();
const registry = createRegistry(config);

type Checked = { guardrailId: string; hook: string; verdict: unknown; policyCardId?: string };

function checkedOf(events: readonly EngineEvent[]): Checked[] {
	return events
		.filter((event) => event.type === 'guardrail.checked')
		.map((event) => {
			const payload = event.payload as Checked;
			return {
				guardrailId: payload.guardrailId,
				hook: payload.hook,
				verdict: payload.verdict,
				...(payload.policyCardId ? { policyCardId: payload.policyCardId } : {})
			};
		});
}

async function sequences(campaign: Campaign): Promise<{
	report: CampaignReport;
	byOrdinal: Map<number, Checked[]>;
	stamped: number;
}> {
	const byOrdinal = new Map<number, Checked[]>();
	let stamped = 0;
	const count = (events: readonly EngineEvent[]) => {
		for (const event of events) {
			if (event.type === 'guardrail.checked' && 'componentId' in event.payload) stamped += 1;
		}
	};
	const report = await runCampaign(campaign, {
		packs: config.packs,
		plans: harnessPlans,
		egress: 'none',
		onTrace: (cell, trace) => {
			byOrdinal.set(cell.ordinal ?? -1, checkedOf(trace.events));
			count(trace.events);
		},
		onWorkflowRun: ({ cell, agentRuns }) => {
			const events = agentRuns.flatMap((run) => run.events);
			byOrdinal.set(cell.ordinal ?? -1, checkedOf(events));
			count(events);
		}
	});
	return { report, byOrdinal, stamped };
}

/** The same campaign with every Safety and Guard brick translated to components. */
function asComponents(campaign: Campaign): Campaign {
	return {
		...campaign,
		guards: campaign.guards.map((guard) => {
			const components = componentFitsFor(guard, registry);
			if (components.length === 0) return guard;
			return {
				...guard,
				fit: guard.fit.filter(
					(brick) => brick.kind !== 'starter/safety' && brick.kind !== 'workshop/guard'
				),
				components
			};
		})
	};
}

function fileCampaign(name: string): Campaign {
	const raw = JSON.parse(readFileSync(resolve(ROOT, 'campaigns', name), 'utf8')) as unknown;
	const campaign = campaignSchema.parse(raw);
	return { ...campaign, seeds: [campaign.seeds[0] ?? 1] };
}

async function expectIdentical(campaign: Campaign): Promise<void> {
	const bricks = await sequences(campaign);
	const components = await sequences(asComponents(campaign));
	// No cell errored on either path — an errored cell has no trace, and two empty traces prove nothing.
	expect(bricks.report.cells.filter((cell) => cell.error !== undefined)).toEqual([]);
	expect(components.report.cells.filter((cell) => cell.error !== undefined)).toEqual([]);
	expect(bricks.byOrdinal.size).toBe(bricks.report.cells.length);
	expect(bricks.stamped).toBe(0);
	expect(components.report.cells).toHaveLength(bricks.report.cells.length);
	expect([...components.byOrdinal.keys()].sort()).toEqual([...bricks.byOrdinal.keys()].sort());
	for (const [ordinal, expected] of bricks.byOrdinal) {
		expect(components.byOrdinal.get(ordinal), `cell ${ordinal}`).toEqual(expected);
	}
	// The translation is not a no-op: where a guard fitted a Safety or Guard brick, the component path stamps its rows.
	const translated = campaign.guards.some((guard) => componentFitsFor(guard, registry).length > 0);
	if (translated) expect(components.stamped).toBeGreaterThan(0);
	// And the cells' outcomes and verdicts agree.
	expect(components.report.cells.map((cell) => [cell.outcome, cell.assertions])).toEqual(
		bricks.report.cells.map((cell) => [cell.outcome, cell.assertions])
	);
}

describe('bricks and components give the same guardrail.checked sequence (WP94, 85-… §6)', () => {
	// Two full campaign runs per case; on a loaded CI box the desk baselines take well over vitest's default.
	const TIMEOUT = 180_000;

	it(
		'the injection baseline at one seed',
		async () => {
			await expectIdentical(injectionBaseline([1]));
		},
		TIMEOUT
	);

	for (const name of [
		'fs-advice-baseline.json',
		'fs-fraud-baseline.json',
		'fs-lending-baseline.json',
		'fs-complaints-baseline.json'
	]) {
		it(
			`${name} at one seed`,
			async () => {
				await expectIdentical(fileCampaign(name));
			},
			TIMEOUT
		);
	}

	it(
		'the lending book campaign',
		async () => {
			await expectIdentical(fileCampaign('fs-lending-book.json'));
		},
		TIMEOUT
	);
});
