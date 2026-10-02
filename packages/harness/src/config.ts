import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import {
	createPackRegistry,
	localPackFrom,
	packDigest,
	type ContentRecord,
	type PackManifest,
	type PackRegistry
} from '@craftabot/core';
import anthropicPack from '@craftabot/pack-anthropic';
import azureContentSafetyPack from '@craftabot/pack-azure-content-safety';
import bedrockGuardrailsPack from '@craftabot/pack-bedrock-guardrails';
import lakeraGuardPack from '@craftabot/pack-lakera-guard';
import evaluatorsPack from '@craftabot/pack-evaluators';
import { evidencePack } from '@craftabot/evidence';
import fsAdvicePack from '@craftabot/pack-fs-advice';
import fsBankPack from '@craftabot/pack-fs-bank';
import fsFraudPack from '@craftabot/pack-fs-fraud';
import fsLendingPack from '@craftabot/pack-fs-lending';
import fsOnboardingPack from '@craftabot/pack-fs-onboarding';
import fsDisputesPack from '@craftabot/pack-fs-disputes';
import fsCollectionsPack from '@craftabot/pack-fs-collections';
import fsServicingPack from '@craftabot/pack-fs-servicing';
import { GENERIC_CONTROL_MAP_MANIFEST } from '@craftabot/governance/reports';
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
	/**
	 * Content digests pinned by pack id (WP141, `packDigest`): a pack whose
	 * tools, cards or stacks differ from its pin is refused at registration.
	 * The default config pins every shipped pack from `packs.lock.json`.
	 */
	pins?: Readonly<Record<string, string>>;
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
		// The builder's own two DGX Sparks (`99-DGX-SPARK.md`) left this list in WP120 (G90): their four hosts are the
		// builder's, so the pack is opt-in — `packages/packs/dgx-spark/craftabot.config.mjs`.
		monitorPack,
		workshopPack,
		geapPack,
		guardLocalPack,
		azureContentSafetyPack,
		// WP99 (`30-…`'s dated note): the two harness-only connections — SigV4 and a bearer token the browser must not hold.
		bedrockGuardrailsPack,
		lakeraGuardPack,
		pdpOpaPack,
		evaluatorsPack,
		fsBankPack,
		fsAdvicePack,
		fsFraudPack,
		fsLendingPack,
		// WP103: the fourth desk.
		fsOnboardingPack,
		// WP104: the fifth desk.
		fsDisputesPack,
		// WP105: the sixth desk.
		fsCollectionsPack,
		// WP106: the seventh desk.
		fsServicingPack,
		evidencePack,
		// WP67 (`53-…` §4.1): the generic control map under governance's synthetic manifest.
		GENERIC_CONTROL_MAP_MANIFEST as unknown as PackManifest
	];
}

/** Where the shipped packs' pins live: committed beside the package, rewritten by `craftabot packs lock`. */
export const PACKS_LOCK_FILE = fileURLToPath(new URL('../packs.lock.json', import.meta.url));

/** The lock file's shape (WP141). */
export interface PacksLock {
	format: 'craftabot-packs-lock';
	formatVersion: 1;
	packs: Record<string, string>;
}

/** The lock for a set of packs: each pack's content digest, by id, sorted. */
export function packsLockFor(packs: readonly PackManifest[]): PacksLock {
	const entries = packs.map((pack) => [pack.id, packDigest(pack)] as const);
	entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
	return { format: 'craftabot-packs-lock', formatVersion: 1, packs: Object.fromEntries(entries) };
}

/** The committed pins, or none when the file is absent (a host outside this repository). */
export function shippedPins(): Record<string, string> | undefined {
	if (!existsSync(PACKS_LOCK_FILE)) return undefined;
	return (JSON.parse(readFileSync(PACKS_LOCK_FILE, 'utf8')) as PacksLock).packs;
}

export function defaultConfig(): HarnessConfig {
	const pins = shippedPins();
	return { packs: defaultPacks(), ...(pins ? { pins } : {}) };
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
	// A config module may pin its packs too (WP141): a record of digests by pack id.
	const pins = (candidate as { pins?: unknown }).pins;
	if (
		pins !== undefined &&
		(typeof pins !== 'object' ||
			pins === null ||
			Object.values(pins).some((value) => typeof value !== 'string'))
	)
		throw new Error(`${source}: pins must map pack ids to content digests`);
	return {
		packs: packs as PackManifest[],
		...(pins ? { pins: pins as Record<string, string> } : {})
	};
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
	const registry = createPackRegistry(config.pins ? { pins: config.pins } : {});
	for (const pack of config.packs) registry.registerPack(pack);
	// Authored content as the `local` pack (WP46) — present even when empty, so `local/*` ids resolve the same way everywhere.
	registry.registerPack(localPackFrom(config.content ?? []));
	return registry;
}

/** Pack ids and versions, for run records and kit-file `requires` blocks — the workbench's own shape. */
export function packVersions(config: HarnessConfig): Record<string, string> {
	return Object.fromEntries(config.packs.map((pack) => [pack.id, pack.version]));
}
