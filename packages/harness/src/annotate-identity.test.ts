import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { GuardrailComponent, PackManifest } from '@craftabot/core';
import { z } from 'zod';
import { campaignSchema, componentFitsFor, runCampaign, type Campaign } from '@craftabot/evals';
import { createRegistry, defaultConfig } from './config.js';
import { harnessPlans } from './plans.js';

/**
 * **`annotate` never changes an outcome** (WP96, `84-…` WP96's DoD): the
 * lending baseline at one seed, run with every guard translated to
 * components, and run again with an annotating component fitted at every
 * loop point beside them, gives the same outcomes, assertions, evaluations
 * and verdict sequence — the annotation is on the events and nowhere else.
 */

const ROOT = resolve(import.meta.dirname, '../../..');

const ANNOTATE_ID = 'annotate-test/always';
const annotateAlways: GuardrailComponent<Record<string, never>> = {
	id: ANNOTATE_ID,
	name: 'Annotate always',
	description: 'Allows everything and says so.',
	technique: 'monitor',
	points: ['pre-think', 'pre-act', 'post-act'],
	verdicts: ['annotate'],
	cost: { class: 'free', latency: 'none' },
	configSchema: z.object({}),
	explain: () => 'Notes every check.',
	compile: (_config, _deps, point) => [
		{
			id: `${ANNOTATE_ID}:${point.kind}`,
			name: 'Annotate always',
			description: 'Allows everything and says so.',
			hooks: [point.kind as 'pre-think' | 'pre-act' | 'post-act'],
			componentId: ANNOTATE_ID,
			point,
			check: () => ({
				allow: true,
				verdictKind: 'annotate',
				finding: { category: 'note', label: 'seen' }
			})
		}
	]
};
// Not `test`: the runner's own cartridge pack has that id, and a second `test` is skipped as installed.
const ANNOTATE_PACK: PackManifest = {
	id: 'annotate-test',
	name: 'Test components',
	version: '1.0.0',
	requiresCore: '>=1.0.0',
	guardrailComponents: [annotateAlways as GuardrailComponent]
};

const config = defaultConfig();
const packs = [...config.packs, ANNOTATE_PACK];
const registry = createRegistry({ packs });

function lendingBaseline(): Campaign {
	const raw = JSON.parse(
		readFileSync(resolve(ROOT, 'campaigns', 'fs-lending-baseline.json'), 'utf8')
	) as unknown;
	const campaign = campaignSchema.parse(raw);
	return {
		...campaign,
		seeds: [campaign.seeds[0] ?? 1],
		guards: campaign.guards.map((guard) => ({
			...guard,
			fit: guard.fit.filter(
				(brick) => brick.kind !== 'starter/safety' && brick.kind !== 'workshop/guard'
			),
			components: componentFitsFor(guard, registry)
		}))
	};
}

function annotated(campaign: Campaign): Campaign {
	return {
		...campaign,
		guards: campaign.guards.map((guard) => ({
			...guard,
			components: [
				...(guard.components ?? []),
				...(['pre-think', 'pre-act', 'post-act'] as const).map((kind) => ({
					id: ANNOTATE_ID,
					point: { kind }
				}))
			]
		}))
	};
}

type Row = {
	guard: string;
	scenario: string;
	outcome: string | undefined;
	assertions: Record<string, boolean>;
	evaluations: Record<string, string>;
};

async function rows(campaign: Campaign): Promise<{ rows: Row[]; annotations: number }> {
	let annotations = 0;
	const report = await runCampaign(campaign, {
		packs,
		plans: harnessPlans,
		egress: 'none',
		onTrace: (_cell, trace) => {
			for (const event of trace.events) {
				if (
					event.type === 'guardrail.checked' &&
					'allow' in event.payload.verdict &&
					event.payload.verdict.allow &&
					event.payload.verdict.verdictKind === 'annotate'
				) {
					annotations += 1;
				}
			}
		}
	});
	expect(report.cells.filter((cell) => cell.error !== undefined).map((cell) => cell.error)).toEqual(
		[]
	);
	return {
		rows: report.cells.map((cell) => ({
			guard: cell.guard,
			scenario: cell.scenario,
			outcome: cell.outcome,
			assertions: cell.assertions,
			evaluations: cell.evaluations
		})),
		annotations
	};
}

describe('annotate never changes an outcome (WP96)', () => {
	it('the lending baseline with an annotating component at every loop point reads the same', async () => {
		const plain = await rows(lendingBaseline());
		const noted = await rows(annotated(lendingBaseline()));
		expect(plain.annotations).toBe(0);
		expect(noted.annotations).toBeGreaterThan(0);
		expect(noted.rows).toEqual(plain.rows);
	}, 180_000);
});
