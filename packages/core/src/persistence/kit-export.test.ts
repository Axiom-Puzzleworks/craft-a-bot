import { describe, expect, it } from 'vitest';
import { buildKitFile, importKitFile } from './kit-export.js';
import { REDACTED } from './redact.js';
import type { AgentSpec } from '../schemas/agent-spec.js';

function makeSpec(overrides: Partial<AgentSpec> = {}): AgentSpec {
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

const requires = { core: '>=0.0.1', packs: { starter: '>=0.2.0' } };
const options = { exportedBy: 'craftabot-workbench/0.0.1', requires };

describe('buildKitFile', () => {
	it('produces a valid kit file carrying the spec verbatim', () => {
		const spec = makeSpec();
		const kit = buildKitFile(spec, { ...options, exportedAt: '2026-08-12T10:00:00Z' });

		expect(kit.format).toBe('craftabot-kit');
		expect(kit.formatVersion).toBe(1);
		expect(kit.agent).toEqual(spec);
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
		const spec = makeSpec({
			bricks: {
				...makeSpec().bricks,
				llm: {
					cartridgeId: 'openai/quick-thinker',
					temperature: 0.7,
					maxTokens: 300,
					personality: 'sk-secret-key-value'
				}
			}
		});
		const kit = buildKitFile(spec, { ...options, secrets: ['sk-secret-key-value'] });
		expect(kit.agent.bricks.llm?.personality).toBe(REDACTED);
	});
});

describe('the export → import round trip (WP4 definition of done)', () => {
	it('preserves the spec exactly, through JSON', () => {
		const spec = makeSpec();
		const kit = buildKitFile(spec, options);

		const result = importKitFile(JSON.parse(JSON.stringify(kit)), {
			installedPacks: ['starter']
		});

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.imported.spec).toEqual(spec);
		expect(result.imported.idWasRegenerated).toBe(false);
	});

	it('survives a second round trip unchanged', () => {
		const spec = makeSpec();
		const once = importKitFile(JSON.parse(JSON.stringify(buildKitFile(spec, options))), {
			installedPacks: ['starter']
		});
		if (!once.ok) throw new Error('first import failed');

		const twice = importKitFile(
			JSON.parse(JSON.stringify(buildKitFile(once.imported.spec, options))),
			{ installedPacks: ['starter'] }
		);
		if (!twice.ok) throw new Error('second import failed');

		expect(twice.imported.spec).toEqual(spec);
	});

	it('preserves unknown top-level fields, for forward compatibility (07 §4)', () => {
		const kit = { ...buildKitFile(makeSpec(), options), futureField: { some: 'thing' } };
		const result = importKitFile(JSON.parse(JSON.stringify(kit)), { installedPacks: ['starter'] });

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
			installedPacks: ['starter'],
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
			installedPacks: ['starter'],
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
		const result = importKitFile(JSON.parse(JSON.stringify(buildKitFile(spec, options))), {
			installedPacks: ['starter']
		});
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
		const result = importKitFile({ not: 'a kit file' }, { installedPacks: ['starter'] });
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.problem.kind).toBe('invalid-file');
	});

	it('reports a kit file from a newer set', () => {
		const kit = { ...buildKitFile(makeSpec(), options), formatVersion: 99 };
		const result = importKitFile(kit, { installedPacks: ['starter'] });
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.problem.kind).toBe('invalid-file');
	});

	it('names the missing packs when the bot needs parts we do not have (03 §9)', () => {
		const kit = buildKitFile(makeSpec(), {
			...options,
			requires: { core: '>=0.0.1', packs: { starter: '>=0.2.0', 'llm-multipack': '>=1.0.0' } }
		});
		const result = importKitFile(JSON.parse(JSON.stringify(kit)), { installedPacks: ['starter'] });

		expect(result.ok).toBe(false);
		if (result.ok) return;
		if (result.problem.kind !== 'missing-packs') throw new Error('expected missing-packs');
		expect(result.problem.missing).toEqual(['llm-multipack']);
		expect(result.problem.message).toContain('llm-multipack');
	});
});
