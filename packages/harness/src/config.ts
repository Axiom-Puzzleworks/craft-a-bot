import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import {
	createPackRegistry,
	localPackFrom,
	type ContentRecord,
	type PackManifest,
	type PackRegistry
} from '@craftabot/core';
import anthropicPack from '@craftabot/pack-anthropic';
import azureContentSafetyPack from '@craftabot/pack-azure-content-safety';
import evaluatorsPack from '@craftabot/pack-evaluators';
import fsBankPack from '@craftabot/pack-fs-bank';
import geapPack from '@craftabot/pack-geap';
import guardLocalPack from '@craftabot/pack-guard-local';
import geminiPack from '@craftabot/pack-gemini';
import monitorPack from '@craftabot/pack-monitor';
import ollamaPack from '@craftabot/pack-ollama';
import openAiPack from '@craftabot/pack-openai';
import pdpOpaPack from '@craftabot/pack-pdp-opa';
import personasPack from '@craftabot/pack-personas';
import starterPack from '@craftabot/pack-starter';
import workshopPack from '@craftabot/pack-workshop';

/**
 * **The explicit pack list, the harness's way** (WP37, `26-…` §6.8).
 *
 * The workbench installs packs by listing them in `apps/workbench/src/lib/
 * packs.ts` — no dynamic loading, no marketplace (`01-…` §4). The harness
 * holds to the same rule: the default list below is every workspace pack the
 * workbench ships bar the Kit's own keyless demo pack (a teaching device that
 * lives in the app, `demo-pack.ts`), and a user who wants a different list
 * writes a config file that exports one. Nothing is discovered.
 *
 * The config is a plain ES module (`craftabot.config.mjs`/`.js`) rather than
 * the `.ts` `26-…` §6.8 named: a CLI that ran TypeScript config would need a
 * loader the repo does not ship, and a module that `export default { packs }`
 * is the whole of what the file has to say.
 */
export interface HarnessConfig {
	packs: PackManifest[];
	/** Authored content (WP46, `34-CONTENT-STORE.md` §4.5) — the `content/` directory's records, registered as the `local` pack. */
	content?: ContentRecord[];
}

export function defaultPacks(): PackManifest[] {
	return [
		starterPack,
		openAiPack,
		personasPack,
		anthropicPack,
		geminiPack,
		ollamaPack,
		monitorPack,
		workshopPack,
		geapPack,
		guardLocalPack,
		azureContentSafetyPack,
		pdpOpaPack,
		evaluatorsPack,
		fsBankPack
	];
}

export function defaultConfig(): HarnessConfig {
	return { packs: defaultPacks() };
}

/** Load a config module by path; its default export (or `config`) must be `{ packs: PackManifest[] }`. */
export async function loadConfig(path: string): Promise<HarnessConfig> {
	const url = pathToFileURL(resolve(path)).href;
	const loaded = (await import(url)) as { default?: unknown; config?: unknown };
	const candidate = loaded.default ?? loaded.config;
	return parseConfig(candidate, path);
}

export function parseConfig(candidate: unknown, source = 'config'): HarnessConfig {
	if (typeof candidate !== 'object' || candidate === null || !('packs' in candidate)) {
		throw new Error(`${source} must export { packs: PackManifest[] }`);
	}
	const packs = (candidate as { packs: unknown }).packs;
	if (!Array.isArray(packs) || packs.some((pack) => !isManifest(pack))) {
		throw new Error(
			`${source}: every entry in packs must be a pack manifest with an id and a version`
		);
	}
	return { packs: packs as PackManifest[] };
}

function isManifest(value: unknown): value is PackManifest {
	return (
		typeof value === 'object' &&
		value !== null &&
		typeof (value as { id?: unknown }).id === 'string' &&
		typeof (value as { version?: unknown }).version === 'string'
	);
}

export function createRegistry(config: HarnessConfig): PackRegistry {
	const registry = createPackRegistry();
	for (const pack of config.packs) registry.registerPack(pack);
	// Authored content as the `local` pack (WP46) — present even when empty, so `local/*` ids resolve the same way everywhere.
	registry.registerPack(localPackFrom(config.content ?? []));
	return registry;
}

/** Pack ids and versions, for run records and kit-file `requires` blocks — the workbench's own shape. */
export function packVersions(config: HarnessConfig): Record<string, string> {
	return Object.fromEntries(config.packs.map((pack) => [pack.id, pack.version]));
}
