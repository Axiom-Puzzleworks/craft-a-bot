import { describe, expect, it } from 'vitest';
import { brickKindsFor, buildKitFile, importKitFile } from './kit-export.js';
import { REDACTED } from './redact.js';
import { toSpecV2, type AgentSpecV2 } from '../schemas/agent-spec-v2.js';
import type { AgentSpec } from '../schemas/agent-spec.js';
import { createPackRegistry } from '../pack-registry.js';
import { llmBrickSchema } from '../schemas/agent-spec.js';

/** The v1 bot these tests used to build, kept to prove export still accepts one. */
function makeSpecV1(overrides: Partial<AgentSpec> = {}): AgentSpec {
	return {
		id: '11111111-1111-4111-8111-111111111111',
		name: 'Snackbot 3000',
		bricks: {
			llm: {
				cartridgeId: 'openai/quick-thinker',
				temperature: 0.7,
				maxTokens: 300,
				personality: 'You are a cheerful little robot.'
			},
			memory: { windowSize: 10, notebook: true },
			tools: { enabled: ['starter/calculator'] },
			sense: { channels: ['sight', 'compass'] },
			actions: { enabled: ['move', 'say'] },
			safety: { maxTicks: 30, blockedActions: [], approvalMode: false }
		},
		goalCardId: 'starter/snack',
		createdAt: '2026-08-12T09:00:00Z',
		updatedAt: '2026-08-12T09:30:00Z',
		schemaVersion: 1,
		...overrides
	};
}

function makeSpec(overrides: Partial<AgentSpecV2> = {}): AgentSpecV2 {
	return { ...toSpecV2(makeSpecV1()), ...overrides };
}

const brickKinds = {
	'starter/llm': 'starter',
	'starter/memory': 'starter',
	'starter/tools': 'starter',
	'starter/sense': 'starter',
	'starter/actions': 'starter',
	'starter/safety': 'starter'
};
const requires = { core: '>=0.0.1', packs: { starter: '>=0.2.0' }, brickKinds };
const options = { exportedBy: 'craftabot-workbench/0.0.1', requires };
const installed = { installedPacks: ['starter'], installedBrickKinds: Object.keys(brickKinds) };

describe('buildKitFile', () => {
	it('produces a valid kit file carrying the spec verbatim', () => {
		const spec = makeSpec();
		const kit = buildKitFile(spec, { ...options, exportedAt: '2026-08-12T10:00:00Z' });

		expect(kit.format).toBe('craftabot-kit');
		expect(kit.formatVersion).toBe(2);
		expect(kit.agent).toEqual(spec);
	});

	it('accepts a v1 bot and exports it as v2, because export is where a shelf catches up', () => {
		const kit = buildKitFile(makeSpecV1(), options);
		expect(kit.agent.schemaVersion).toBe(2);
		expect(kit.agent).toEqual(toSpecV2(makeSpecV1()));
	});

	it('carries optional notes, and omits the field when there are none', () => {
		expect(buildKitFile(makeSpec(), { ...options, notes: 'My best bot' }).notes).toBe(
			'My best bot'
		);
		expect(buildKitFile(makeSpec(), options).notes).toBeUndefined();
	});

	it('never contains run history or identity — a kit file is safe to share (07 §4)', () => {
		const serialised = JSON.stringify(buildKitFile(makeSpec(), options));
		expect(serialised).not.toMatch(/runId|lastRunId|events|usage|apiKey/i);
	});

	it('scrubs a key that somehow reached the spec', () => {
		const spec = toSpecV2(
			makeSpecV1({
				bricks: {
					...makeSpecV1().bricks,
					llm: {
						cartridgeId: 'openai/quick-thinker',
						temperature: 0.7,
						maxTokens: 300,
						personality: 'sk-secret-key-value'
					}
				}
			})
		);
		const kit = buildKitFile(spec, { ...options, secrets: ['sk-secret-key-value'] });
		const brain = kit.agent.bricks.find((brick) => brick.slot === 'brain');
		expect(brain?.config['personality']).toBe(REDACTED);
	});
});

describe('brickKindsFor', () => {
	function registryWith(kindIds: string[]) {
		const registry = createPackRegistry();
		registry.registerPack({
			id: 'starter',
			name: 'Starter',
			version: '1.0.0',
			requiresCore: '>=1.0.0',
			brickKinds: kindIds.map((id) => ({
				id,
				slot: 'brain' as const,
				name: id,
				description: id,
				realName: id,
				realExplanation: id,
				configSchema: llmBrickSchema,
				configVersion: 1,
				defaults: {}
			}))
		});
		return registry;
	}

	it('names the pack that registered each kind, from the registry rather than the id', () => {
		const kinds = brickKindsFor(makeSpec(), registryWith(Object.keys(brickKinds)));
		expect(kinds).toEqual(brickKinds);
	});

	/**
	 * A kind the exporter does not have is a build problem the ribbon is already
	 * reporting. Writing a guessed pack id here would turn it into an import
	 * failure on someone else's machine, blamed on them.
	 */
	it('leaves out a kind no installed pack claims, rather than guessing', () => {
		const kinds = brickKindsFor(makeSpec(), registryWith(['starter/llm']));
		expect(kinds).toEqual({ 'starter/llm': 'starter' });
	});
});

describe('the export → import round trip (WP4 definition of done)', () => {
	it('preserves the spec exactly, through JSON', () => {
		const spec = makeSpec();
		const kit = buildKitFile(spec, options);

		const result = importKitFile(JSON.parse(JSON.stringify(kit)), installed);

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.imported.spec).toEqual(spec);
		expect(result.imported.idWasRegenerated).toBe(false);
	});

	it('survives a second round trip unchanged', () => {
		const spec = makeSpec();
		const once = importKitFile(JSON.parse(JSON.stringify(buildKitFile(spec, options))), installed);
		if (!once.ok) throw new Error('first import failed');

		const twice = importKitFile(
			JSON.parse(JSON.stringify(buildKitFile(once.imported.spec, options))),
			installed
		);
		if (!twice.ok) throw new Error('second import failed');

		expect(twice.imported.spec).toEqual(spec);
	});

	it('preserves unknown top-level fields, for forward compatibility (07 §4)', () => {
		const kit = { ...buildKitFile(makeSpec(), options), futureField: { some: 'thing' } };
		const result = importKitFile(JSON.parse(JSON.stringify(kit)), installed);

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect((result.imported.kit as unknown as { futureField: unknown }).futureField).toEqual({
			some: 'thing'
		});
	});
});

describe('importing a copy', () => {
	it('mints a fresh id when the incoming one is already on the shelf', () => {
		const spec = makeSpec();
		const kit = buildKitFile(spec, options);

		const result = importKitFile(JSON.parse(JSON.stringify(kit)), {
			...installed,
			existingAgentIds: [spec.id],
			newId: () => '22222222-2222-4222-8222-222222222222',
			now: () => '2026-08-13T00:00:00Z'
		});

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.imported.idWasRegenerated).toBe(true);
		expect(result.imported.spec.id).toBe('22222222-2222-4222-8222-222222222222');
		expect(result.imported.spec.updatedAt).toBe('2026-08-13T00:00:00Z');
		// Everything else is untouched — it is a copy, not a different bot.
		expect({ ...result.imported.spec, id: spec.id, updatedAt: spec.updatedAt }).toEqual(spec);
	});

	it('falls back to the platform clock and uuid source when none are injected', () => {
		const spec = makeSpec();
		const result = importKitFile(JSON.parse(JSON.stringify(buildKitFile(spec, options))), {
			...installed,
			existingAgentIds: [spec.id]
		});

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.imported.spec.id).not.toBe(spec.id);
		expect(result.imported.spec.id).toMatch(/^[0-9a-f-]{36}$/);
		expect(Number.isNaN(Date.parse(result.imported.spec.updatedAt))).toBe(false);
	});

	it('leaves the id alone when nothing collides, even with no existing ids supplied', () => {
		const spec = makeSpec();
		const result = importKitFile(
			JSON.parse(JSON.stringify(buildKitFile(spec, options))),
			installed
		);
		if (!result.ok) throw new Error('import failed');
		expect(result.imported.spec.id).toBe(spec.id);
	});
});

describe('buildKitFile defaults', () => {
	it('stamps the current time when no exportedAt is given', () => {
		const kit = buildKitFile(makeSpec(), options);
		expect(Number.isNaN(Date.parse(kit.exportedAt))).toBe(false);
	});
});

describe('rejecting bad imports', () => {
	it('reports an unreadable file', () => {
		const result = importKitFile({ not: 'a kit file' }, installed);
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.problem.kind).toBe('invalid-file');
	});

	it('reports a kit file from a newer set', () => {
		const kit = { ...buildKitFile(makeSpec(), options), formatVersion: 99 };
		const result = importKitFile(kit, installed);
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.problem.kind).toBe('invalid-file');
	});

	it('names the missing packs when the bot needs parts we do not have (03 §9)', () => {
		const kit = buildKitFile(makeSpec(), {
			...options,
			requires: {
				core: '>=0.0.1',
				packs: { starter: '>=0.2.0', 'llm-multipack': '>=1.0.0' },
				brickKinds
			}
		});
		const result = importKitFile(JSON.parse(JSON.stringify(kit)), installed);

		expect(result.ok).toBe(false);
		if (result.ok) return;
		if (result.problem.kind !== 'missing-packs') throw new Error('expected missing-packs');
		expect(result.problem.missing).toEqual(['llm-multipack']);
		expect(result.problem.message).toContain('llm-multipack');
	});

	/**
	 * The case v1 could not describe: you *have* the pack, at a version without
	 * the brick. "You need the starter pack" is not an answer when the starter
	 * pack is sitting right there — naming the brick is (`14-…` §2.4).
	 */
	it('names the missing brick when the pack is installed but the brick is not', () => {
		const kit = buildKitFile(makeSpec(), {
			...options,
			requires: { ...requires, brickKinds: { ...brickKinds, 'starter/planner': 'starter' } }
		});
		const result = importKitFile(JSON.parse(JSON.stringify(kit)), installed);

		expect(result.ok).toBe(false);
		if (result.ok) return;
		if (result.problem.kind !== 'missing-bricks') throw new Error('expected missing-bricks');
		expect(result.problem.missing).toEqual(['starter/planner']);
		expect(result.problem.packs).toEqual(['starter']);
		expect(result.problem.message).toContain('starter/planner');
	});

	it('lists several missing bricks and every pack they come from', () => {
		const kit = buildKitFile(makeSpec(), {
			...options,
			requires: {
				...requires,
				packs: { starter: '>=0.2.0', space: '>=1.0.0' },
				brickKinds: { ...brickKinds, 'space/thruster': 'space', 'space/scanner': 'space' }
			}
		});
		const result = importKitFile(JSON.parse(JSON.stringify(kit)), {
			...installed,
			installedPacks: ['starter', 'space']
		});

		expect(result.ok).toBe(false);
		if (result.ok) return;
		if (result.problem.kind !== 'missing-bricks') throw new Error('expected missing-bricks');
		expect(result.problem.missing).toEqual(['space/thruster', 'space/scanner']);
		expect(result.problem.packs).toEqual(['space']);
	});

	/** A caller that cannot answer the question should not be made to answer it wrongly. */
	it('skips the brick check entirely when the caller does not list what it has', () => {
		const kit = buildKitFile(makeSpec(), {
			...options,
			requires: { ...requires, brickKinds: { ...brickKinds, 'starter/planner': 'starter' } }
		});
		const result = importKitFile(JSON.parse(JSON.stringify(kit)), {
			installedPacks: ['starter']
		});
		expect(result.ok).toBe(true);
	});
});
