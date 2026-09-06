import { parentPort } from 'node:worker_threads';
import { readFile } from 'node:fs/promises';
import { localPackFrom, type LLMProvider, type PackRegistry } from '@craftabot/core';
import {
	packFromScenarioFile,
	parseCampaign,
	prepareCampaign,
	runCampaignCell,
	type Campaign,
	type CampaignBrain,
	type CampaignCellSpec,
	type CellResult,
	type PreparedCampaign,
	type RunCampaignOptions
} from '@craftabot/evals';
import type { EgressMode, Principal } from '@craftabot/core';
import { harnessPlans } from '../plans.js';
import { createRegistry, defaultConfig, loadConfig, type HarnessConfig } from '../config.js';
import { credentialsFromEnv, credentialVariable } from '../credentials.js';
import { readContentDir } from '../storage/file-storage.js';

/**
 * **A campaign worker** (WP68, `57-HARNESS-AT-SCALE.md` §4.2): one of the
 * `--jobs` pool. It builds its own registry from the same config path,
 * content directory and scenario packs the main thread had, prepares the
 * campaign against it, and runs each cell it is handed exactly as the
 * runner would (`runCampaignCell`), posting the scored cell and its trace
 * back. It writes nothing: the main thread is the one writer (`57-…` §3).
 * Credentials come from the environment it inherited, never a message.
 */
export interface WorkerInit {
	kind: 'init';
	campaign: unknown;
	configPath?: string;
	contentDir?: string;
	scenarioPacks: string[];
	egress?: EgressMode;
	principal?: Principal;
}
export interface WorkerCell {
	kind: 'cell';
	spec: CampaignCellSpec;
}
export type WorkerMessage = WorkerInit | WorkerCell;
export type WorkerReply =
	| { kind: 'ready' }
	| { kind: 'result'; ordinal: number; result: CellResult }
	| { kind: 'failed'; ordinal: number | undefined; error: string };

async function configFor(init: WorkerInit): Promise<HarnessConfig> {
	const config = init.configPath ? await loadConfig(init.configPath) : defaultConfig();
	if (!init.contentDir) return config;
	const content = await readContentDir(init.contentDir);
	return content.length > 0 ? { ...config, content } : config;
}

function providerFor(brain: CampaignBrain, registry: PackRegistry): LLMProvider {
	if (brain.cartridgeId === undefined)
		throw new Error(`live brain '${brain.id}' names no cartridgeId`);
	const cartridge = registry.getCartridge(brain.cartridgeId);
	if (!cartridge)
		throw new Error(`live brain '${brain.id}': no cartridge '${brain.cartridgeId}' is installed`);
	const factory = registry.getProviderFactory(cartridge.providerId);
	if (!factory)
		throw new Error(`live brain '${brain.id}': no provider '${cartridge.providerId}' is installed`);
	const credentials = credentialsFromEnv();
	let apiKey = '';
	if (factory.keyRequirement === 'required') {
		const key = credentials.get(factory.id);
		if (key === undefined) {
			throw new Error(`provider ${factory.id} needs a key: set ${credentialVariable(factory.id)}`);
		}
		apiKey = key;
	}
	return factory.create({ apiKey });
}

/** Everything a cell needs, built once per worker from the init message. */
export async function prepareInWorker(
	init: WorkerInit
): Promise<{ prepared: PreparedCampaign; options: RunCampaignOptions }> {
	const config = await configFor(init);
	const scenarioPacks = await Promise.all(
		init.scenarioPacks.map(async (path) =>
			packFromScenarioFile(JSON.parse(await readFile(path, 'utf8')))
		)
	);
	const packs = [...config.packs, ...scenarioPacks];
	const content = config.content;
	const registry = createRegistry({ packs, ...(content ? { content } : {}) });
	const runnerPacks = content ? [...packs, localPackFrom(content)] : packs;
	const credentials = credentialsFromEnv();
	const options: RunCampaignOptions = {
		packs: runnerPacks,
		plans: harnessPlans,
		providerFor: (brain) => providerFor(brain, registry),
		egress: init.egress ?? 'declared',
		...(init.principal ? { principal: init.principal } : {}),
		credentials: (id) => credentials.get(id)
	};
	const campaign: Campaign = parseCampaign(init.campaign);
	return { prepared: prepareCampaign(campaign, options), options };
}

if (parentPort) {
	const port = parentPort;
	let ready: Promise<{ prepared: PreparedCampaign; options: RunCampaignOptions }> | undefined;
	port.on('message', (message: WorkerMessage) => {
		if (message.kind === 'init') {
			ready = prepareInWorker(message);
			ready.then(
				() => port.postMessage({ kind: 'ready' } satisfies WorkerReply),
				(error) =>
					port.postMessage({
						kind: 'failed',
						ordinal: undefined,
						error: error instanceof Error ? error.message : String(error)
					} satisfies WorkerReply)
			);
			return;
		}
		const spec = message.spec;
		(ready ?? Promise.reject(new Error('the worker was handed a cell before its init')))
			.then(({ prepared, options }) => runCampaignCell(spec, prepared, options))
			.then(
				(result) =>
					port.postMessage({ kind: 'result', ordinal: spec.ordinal, result } satisfies WorkerReply),
				(error) =>
					port.postMessage({
						kind: 'failed',
						ordinal: spec.ordinal,
						error: error instanceof Error ? error.message : String(error)
					} satisfies WorkerReply)
			);
	});
}
