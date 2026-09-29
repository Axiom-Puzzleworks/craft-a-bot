import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { EngineEvent } from '@craftabot/core';
import { campaignSchema, runCampaign, type Campaign } from '@craftabot/evals';
import { createRegistry, defaultConfig } from './config.js';
import { harnessPlans } from './plans.js';

/**
 * **The hosted guards, plugged in** (WP113, `101-DAY7-ROADMAP.md`; `89-STACKS.md`
 * §8, `100-…` §2 fact 10, tenet 37). Until WP113 the advice, fraud and lending
 * baselines fitted `geap/model-armor` with `serviceConfig: '{}'`, which the
 * service refuses, so their `+hosted-guard` guard ran the Guard brick's floor
 * alone. Two promises now: no shipped campaign fits a Guard brick with a config
 * its service refuses — a guard in a baseline runs — and a plugged-in guard's
 * service answers on the trace, through its offline stand-in.
 */
const ROOT = resolve(import.meta.dirname, '../../..');
const config = defaultConfig();
const registry = createRegistry(config);

interface Fit {
	kind?: string;
	config?: { serviceId?: string; serviceConfig?: string; screening?: { offline?: boolean } };
}

function campaignFiles(dir: string): string[] {
	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
		entry.isDirectory()
			? campaignFiles(join(dir, entry.name))
			: entry.name.endsWith('.json')
				? [join(dir, entry.name)]
				: []
	);
}

function guardBricksIn(value: unknown, out: Fit[] = []): Fit[] {
	if (Array.isArray(value)) for (const entry of value) guardBricksIn(entry, out);
	else if (value && typeof value === 'object') {
		if ((value as Fit).kind === 'workshop/guard') out.push(value as Fit);
		for (const entry of Object.values(value)) guardBricksIn(entry, out);
	}
	return out;
}

describe('the hosted guards, plugged in (WP113)', () => {
	it('no shipped campaign fits a Guard brick with a config its service refuses', () => {
		const files = campaignFiles(join(ROOT, 'campaigns'));
		const refused: string[] = [];
		let fitted = 0;
		for (const file of files) {
			for (const brick of guardBricksIn(JSON.parse(readFileSync(file, 'utf8')))) {
				const serviceId = brick.config?.serviceId ?? '';
				const service = registry.getGuardrailService(serviceId);
				if (!service) {
					refused.push(`${file}: ${serviceId} is not installed`);
					continue;
				}
				fitted += 1;
				const parsed = service.configSchema.safeParse(
					JSON.parse(brick.config?.serviceConfig ?? '{}')
				);
				if (!parsed.success)
					refused.push(`${file}: ${serviceId} refuses ${brick.config?.serviceConfig}`);
			}
		}
		expect(refused).toEqual([]);
		// The three desk baselines' hosted guards, the injection baseline's two, the desks' local classifiers.
		expect(fitted).toBeGreaterThanOrEqual(12);
	});

	it(
		'the lending baseline’s hosted guard screens every hook through Model Armor’s stand-in',
		{ timeout: 120_000 },
		async () => {
			const whole = campaignSchema.parse(
				JSON.parse(readFileSync(join(ROOT, 'campaigns', 'fs-lending-baseline.json'), 'utf8'))
			) as Campaign;
			const hosted = whole.guards.find((guard) =>
				guard.fit.some(
					(brick) =>
						brick.kind === 'workshop/guard' && JSON.stringify(brick).includes('geap/model-armor')
				)
			)!;
			const campaign: Campaign = {
				...whole,
				scenarios: whole.scenarios.slice(0, 1),
				guards: [hosted],
				brains: whole.brains.filter((brain) => brain.id === 'scripted-optimal'),
				seeds: [1],
				gates: []
			};
			const external: Array<{ guardrailId: string; outcome: string }> = [];
			const report = await runCampaign(campaign, {
				packs: config.packs,
				plans: harnessPlans,
				egress: 'none',
				onTrace: (_cell, { events }) => {
					for (const event of events as readonly EngineEvent[])
						if (event.type === 'guardrail.external')
							external.push(event.payload as { guardrailId: string; outcome: string });
				}
			});
			expect(report.cells.every((cell) => cell.error === undefined)).toBe(true);
			expect(external.length).toBeGreaterThan(0);
			expect(external.every((call) => call.outcome === 'offline')).toBe(true);
		}
	);
});
