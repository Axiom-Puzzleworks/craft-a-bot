import { createPackRegistry } from '@craftabot/core';
import { describe, expect, it } from 'vitest';
import { checkCartridge } from './checks/cartridge.js';
import { checkGoldenTrace } from './checks/golden-trace.js';
import { checkGuardrail } from './checks/guardrail.js';
import { checkManifest } from './checks/manifest.js';
import { checkTool } from './checks/tool.js';
import { checkWorld } from './checks/world.js';
import type { ConformanceIssue, PackConformanceFixture } from './types.js';

function format(issues: ConformanceIssue[]): string {
	return issues.map((issue) => `[${issue.check}] ${issue.message}`).join('\n');
}

/**
 * The Vitest half of the kit: wraps every `13-…` §7 check that applies to a
 * fixture in its own `it()`, so a pack's own `contract.test.ts` reads like
 * any other test file and its failures point straight at the offending
 * category. A category a fixture omits (no `world`, no `tools`, …) is simply
 * not asserted — `openai` ships cartridges alone, and that is a complete pack
 * as far as this kit is concerned.
 */
export function describeConformance(fixture: PackConformanceFixture): void {
	const { manifest, companionPacks = [] } = fixture;

	describe(`pack conformance: ${manifest.id}`, () => {
		it('manifest validates, ids are qualified, and registers without collision', () => {
			const issues = checkManifest(manifest, { companionPacks });
			expect(issues, format(issues)).toEqual([]);
		});

		if (fixture.world) {
			const worldFixture = fixture.world;
			it(`world "${worldFixture.worldId}" loads, replays deterministically, rejects illegal calls cleanly, and every predicate is reachable`, () => {
				const world = manifest.worlds?.find((candidate) => candidate.id === worldFixture.worldId);
				if (!world) {
					throw new Error(
						`fixture names world "${worldFixture.worldId}" but "${manifest.id}" does not ship it`
					);
				}
				const issues = checkWorld(world, worldFixture);
				expect(issues, format(issues)).toEqual([]);
			});
		}

		for (const tool of manifest.tools ?? []) {
			it(`tool "${tool.id}" executes offline, deterministically, with an honest schema`, async () => {
				const example = fixture.tools?.examples[tool.id];
				if (example === undefined) {
					throw new Error(`no example arguments supplied for tool "${tool.id}"`);
				}
				const issues = await checkTool(tool, example);
				expect(issues, format(issues)).toEqual([]);
			});
		}

		for (const entry of fixture.guardrails?.guardrails ?? []) {
			it(`guardrail "${entry.guardrail.id}" is pure, legal, and describes itself`, async () => {
				const issues = await checkGuardrail(entry.guardrail, entry.context);
				expect(issues, format(issues)).toEqual([]);
			});
		}

		for (const cartridge of manifest.cartridges ?? []) {
			it(`cartridge "${cartridge.id}" is a complete catalogue entry`, () => {
				const issues = checkCartridge(cartridge);
				expect(issues, format(issues)).toEqual([]);
			});
		}

		if (fixture.goldenTrace) {
			const goldenTrace = fixture.goldenTrace;
			it('a scripted run through the pack produces only catalogued event types', async () => {
				const registry = createPackRegistry();
				for (const companion of companionPacks) registry.registerPack(companion);
				registry.registerPack(manifest);
				const issues = await checkGoldenTrace(registry, goldenTrace);
				expect(issues, format(issues)).toEqual([]);
			});
		}
	});
}
