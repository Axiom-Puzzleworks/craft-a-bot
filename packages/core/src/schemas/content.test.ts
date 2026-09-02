import { describe, expect, it } from 'vitest';
import { createPackRegistry } from '../pack-registry.js';
import {
	buildKitFile,
	importKitFile,
	localContentReferencedBy
} from '../persistence/kit-export.js';
import { makeContent, makeSpec } from '../testing/storage-fixtures.js';
import type { PackManifest } from './pack-manifest.js';
import {
	contentRecordFor,
	isLocalId,
	localContentId,
	localPackFrom,
	safeParseContentRecord,
	slugOf
} from './content.js';

describe('content records (WP46)', () => {
	it('ids are local/<segment>/<slug>, and slugs come from titles', () => {
		expect(slugOf('No Shouting, please!')).toBe('no-shouting-please');
		expect(slugOf('***')).toBe('untitled');
		expect(localContentId('policy-card', 'quiet')).toBe('local/policy/quiet');
		expect(localContentId('assertion-card', 'x')).toBe('local/testbench/x');
		expect(localContentId('scenario', 'x')).toBe('local/scenarios/x');
		expect(localContentId('campaign', 'x')).toBe('local/campaigns/x');
		expect(isLocalId('local/policy/x')).toBe(true);
		expect(isLocalId('starter/policy/x')).toBe(false);
	});

	it('validates the inner card for the three core kinds and keeps a campaign opaque', () => {
		expect(safeParseContentRecord(makeContent()).success).toBe(true);
		expect(
			safeParseContentRecord(makeContent({ record: { id: 'local/policy/no-shouting' } })).success
		).toBe(false);
		expect(safeParseContentRecord(makeContent({ id: 'local/scenarios/no-shouting' })).success).toBe(
			false
		);
		expect(
			safeParseContentRecord({
				id: 'local/campaigns/anything',
				kind: 'campaign',
				title: 'Anything',
				record: { whatever: true },
				savedAt: '2026-09-02T00:00:00.000Z',
				schemaVersion: 1
			}).success
		).toBe(true);
	});

	it('wraps a card as a record with the id made local', () => {
		const record = contentRecordFor(
			'policy-card',
			{
				id: 'workshop/policy/untitled',
				title: 'Quiet Please',
				schemaVersion: 1,
				rules: [
					{
						hook: 'pre-act',
						when: { kind: 'call-name-is', value: 'say' },
						then: 'block-action',
						reason: 'shh'
					}
				]
			},
			{ savedAt: '2026-09-02T00:00:00.000Z' }
		);
		expect(record.id).toBe('local/policy/quiet-please');
		expect((record.record as { id: string }).id).toBe('local/policy/quiet-please');
	});

	it('the local pack carries the three card kinds and no campaigns', () => {
		const pack = localPackFrom([
			makeContent(),
			{
				id: 'local/campaigns/c',
				kind: 'campaign',
				title: 'C',
				record: {},
				savedAt: '2026-09-02T00:00:00.000Z',
				schemaVersion: 1
			}
		]);
		expect(pack.id).toBe('local');
		expect(pack.policyCards?.map((card) => card.id)).toEqual(['local/policy/no-shouting']);
		expect(pack.assertionCards).toBeUndefined();
		const registry = createPackRegistry();
		registry.registerPack(pack);
		expect(registry.getPolicyCard('local/policy/no-shouting')?.title).toBe('No shouting');
	});

	it('a shipped pack may not use the local prefix', () => {
		const registry = createPackRegistry();
		const trespasser: PackManifest = {
			id: 'starter-ish',
			name: 'x',
			version: '0.0.1',
			requiresCore: '>=0.0.1',
			policyCards: [
				makeContent().record as PackManifest['policyCards'] extends (infer T)[] | undefined
					? T
					: never
			]
		};
		expect(() => registry.registerPack(trespasser)).toThrow(/reserved for authored content/);
	});
});

describe('kit files carry local content (WP46)', () => {
	const spec = () => {
		const base = makeSpec();
		return {
			...base,
			bricks: [
				...base.bricks,
				{
					slot: 'safety' as const,
					kind: 'starter/safety',
					configVersion: 1,
					config: {
						maxTicks: 10,
						blockedActions: [],
						approvalMode: false,
						policyCards: ['local/policy/no-shouting']
					}
				}
			]
		};
	};

	it('names the local cards a spec fits, embeds them, and rebuilds them on import under fresh ids', () => {
		expect(localContentReferencedBy(spec())).toEqual(['local/policy/no-shouting']);
		const kit = buildKitFile(spec(), {
			exportedBy: 'test',
			requires: { core: '>=0.0.1', packs: { starter: '0.0.1' }, brickKinds: {} },
			localContent: [makeContent()]
		});
		expect(kit.requires.localContent).toHaveLength(1);

		let n = 0;
		const result = importKitFile(JSON.parse(JSON.stringify(kit)), {
			installedPacks: ['starter'],
			newId: () => `abcdef${n++}`,
			now: () => '2026-09-03T00:00:00.000Z'
		});
		if (!result.ok) throw new Error(result.problem.message);
		const [card] = result.imported.localContent;
		expect(card?.id).toBe('local/policy/no-shouting-abcdef');
		expect((card?.record as { id: string }).id).toBe('local/policy/no-shouting-abcdef');
		expect(card?.savedAt).toBe('2026-09-03T00:00:00.000Z');
		const safety = result.imported.spec.bricks.find((brick) => brick.slot === 'safety');
		expect((safety?.config as { policyCards: string[] }).policyCards).toEqual([
			'local/policy/no-shouting-abcdef'
		]);
	});

	it('refuses a file that references a local card it does not carry', () => {
		const kit = buildKitFile(spec(), {
			exportedBy: 'test',
			requires: { core: '>=0.0.1', packs: { starter: '0.0.1' }, brickKinds: {} }
		});
		const result = importKitFile(JSON.parse(JSON.stringify(kit)), { installedPacks: ['starter'] });
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.problem).toMatchObject({ kind: 'missing-local-content' });
	});

	it('a kit with no local content imports exactly as before', () => {
		const kit = buildKitFile(makeSpec(), {
			exportedBy: 'test',
			requires: { core: '>=0.0.1', packs: { starter: '0.0.1' }, brickKinds: {} }
		});
		expect(kit.requires.localContent).toBeUndefined();
		const result = importKitFile(JSON.parse(JSON.stringify(kit)), { installedPacks: ['starter'] });
		expect(result.ok && result.imported.localContent).toEqual([]);
	});
});
