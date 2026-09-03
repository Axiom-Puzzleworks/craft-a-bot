import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { createRegistry, defaultConfig, loadConfig, packVersions, parseConfig } from './config.js';

const roots: string[] = [];
afterAll(async () => {
	for (const root of roots) await rm(root, { recursive: true, force: true });
});

describe('the default pack list', () => {
	it('is every workspace pack bar the Kit’s own demo pack, and registers cleanly', () => {
		const config = defaultConfig();
		const ids = config.packs.map((pack) => pack.id);
		expect(ids).toEqual([
			'starter',
			'openai',
			'personas',
			'anthropic',
			'gemini',
			'ollama',
			'monitor',
			'workshop',
			'geap',
			'guard-local',
			'azure-content-safety',
			'pdp-opa',
			'evals'
		]);
		expect(ids).not.toContain('demo');

		const registry = createRegistry(config);
		expect(registry.getGoalCard('starter/say-hello')).toBeDefined();
		expect(registry.getBrickKind('geap/armor')).toBeDefined();
		expect(
			registry
				.listProviderFactories()
				.map((p) => p.id)
				.sort()
		).toEqual(['anthropic', 'gemini', 'ollama', 'openai']);
	});

	it('reports pack versions in the workbench’s own shape', () => {
		const versions = packVersions(defaultConfig());
		expect(versions['starter']).toMatch(/^\d+\.\d+\.\d+$/);
		expect(Object.keys(versions)).toHaveLength(13);
	});
});

describe('a config file', () => {
	it('loads a plain module exporting { packs }', async () => {
		const root = await mkdtemp(join(tmpdir(), 'craftabot-config-'));
		roots.push(root);
		const path = join(root, 'craftabot.config.mjs');
		await writeFile(
			path,
			`export default { packs: [{ id: 'tiny', name: 'Tiny', version: '1.0.0', requiresCore: '>=0.0.1' }] };\n`,
			'utf8'
		);
		const config = await loadConfig(path);
		expect(config.packs.map((pack) => pack.id)).toEqual(['tiny']);
	});

	it('refuses a module that does not export a pack list', () => {
		expect(() => parseConfig({})).toThrow(/must export/);
		expect(() => parseConfig({ packs: [{ name: 'no id' }] })).toThrow(/pack manifest/);
		expect(() => parseConfig(null)).toThrow(/must export/);
	});
});
