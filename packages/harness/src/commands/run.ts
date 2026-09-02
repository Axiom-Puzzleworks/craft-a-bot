import type { EgressMode } from '@craftabot/core';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
	brainSlotSchema,
	buildTraceFile,
	createSession,
	importKitFile,
	slotConfig,
	validateSpec,
	type AgentRecord,
	type AgentSpecV2,
	type EngineEvent,
	type LLMProvider,
	type PackRegistry,
	type RunOutcome
} from '@craftabot/core';
import { createMockProvider } from '@craftabot/core/testing';
import { scriptedNoisy, scriptedOptimal } from '@craftabot/evals';
import { summariseRun } from '@craftabot/governance/reports';
import { planFor } from '@craftabot/pack-starter/testing';
import { createRegistry, packVersions, type HarnessConfig } from '../config.js';
import { credentialVariable, type CredentialSource } from '../credentials.js';
import { mulberry32 } from '../random.js';
import { runRecordFrom } from '../run-record.js';
import { createFileStorage } from '../storage/file-storage.js';

/**
 * `craftabot run` (WP37 stage B, `26-…` §6.8): a kit file in, a run
 * directory out — `run.json`, `events.jsonl`, `summary.json`, and a
 * `<runId>.craftabot-trace.json` the Workshop's Run Browser imports with no
 * conversion and whose digest verifies. The same `createSession` the browser
 * calls, the same records, the same fold for the summary.
 *
 * Three brains. The two **scripted** tiers are `@craftabot/evals`' own —
 * the optimal plan the solvability suite proves, or that plan with a seeded
 * amount of wrongness — so a run needs no key and is reproducible from its
 * seed; they exist only for cards with a plan (the starter pack's). **live**
 * uses the kit's own cartridge and that cartridge's provider, with the key
 * read from `CRAFTABOT_CREDENTIAL_<ID>` and nowhere else.
 */
export type BrainTier = 'scripted-optimal' | 'scripted-noisy' | 'live';

export interface RunKitOptions {
	kitPath: string;
	/** Override the kit's own goal card for this run only — the kit is never rewritten. */
	card?: string;
	brain: BrainTier;
	/** With `brain: 'live'`, the provider the kit's cartridge must belong to; a check, not a choice. */
	provider?: string;
	seed: number;
	maxTicks?: number;
	out: string;
	/** What a person would say to every approval. Defaults to yes. */
	approve?: boolean;
	config: HarnessConfig;
	credentials: CredentialSource;
	/** Injected so a test can pin the clock and the ids. */
	now?: () => string;
	newId?: () => string;
	/** Injected `fetch` for a live brain, as every provider pack's own tests do. */
	fetch?: typeof globalThis.fetch;
	/** The session's egress mode (WP41): `'declared'` by default, `'none'` for a run that must not touch the network. */
	egress?: EgressMode;
}

export interface RunKitReport {
	runId: string;
	agentId: string;
	goalCardId: string;
	outcome: RunOutcome;
	ticks: number;
	events: number;
	directory: string;
	traceFile: string;
	providerId: string;
}

export async function runKit(options: RunKitOptions): Promise<RunKitReport> {
	const registry = createRegistry(options.config);
	const spec = await loadSpec(options, registry);

	const problems = validateSpec(spec, registry, {
		hasCredential: (id) => options.credentials.has(id)
	});
	const blocking = problems.filter((problem) => problem.severity === 'blocking');
	if (blocking.length > 0) {
		throw new Error(
			`the bot cannot run:\n${blocking.map((problem) => `  - ${problem.message}`).join('\n')}`
		);
	}

	const { provider, providerId } = chooseBrain(spec, registry, options);
	const storage = await createFileStorage(options.out);
	const now = options.now ?? (() => new Date().toISOString());
	const versions = packVersions(options.config);

	const agent: AgentRecord = {
		id: spec.id,
		spec,
		lastValidation: problems,
		createdAt: spec.createdAt,
		updatedAt: spec.updatedAt,
		schemaVersion: 2
	};
	await storage.putAgent(agent);

	const session = createSession({
		spec,
		registry,
		provider,
		getCredential: (id) => options.credentials.get(id),
		options: {
			now,
			random: mulberry32(options.seed),
			tickDelayMs: 0,
			...(options.newId ? { newId: options.newId } : {}),
			...(options.fetch ? { fetch: options.fetch } : {}),
			egress: options.egress ?? 'declared',
			...(options.maxTicks !== undefined ? { budgets: { maxTicks: options.maxTicks } } : {})
		}
	});

	const events: EngineEvent[] = [];
	let pending: EngineEvent[] = [];
	let writing: Promise<void> = Promise.resolve();
	const startedAt = now();
	const flush = () => {
		const batch = pending;
		pending = [];
		if (batch.length === 0) return writing;
		writing = writing.then(() => storage.appendEvents(session.runId, batch));
		return writing;
	};

	session.events.onAny((event) => {
		events.push(event);
		pending.push(event);
		if (event.type === 'run.started') {
			// The opening record, so a crash mid-run still leaves a run on disk
			// that says how far it got — the Kit's own rule since WP16.
			void storage.putRun(
				runRecordFrom({ runId: session.runId, spec, events, packVersions: versions, startedAt })
			);
		}
		if (event.type === 'tick.completed' || event.type === 'run.finished') void flush();
	});
	session.events.on('approval.requested', () => session.resolveApproval(options.approve ?? true));

	session.start('step');
	let outcome: RunOutcome | undefined;
	const budgetTicks = budgetOf(events) ?? options.maxTicks ?? 30;
	// Headroom so the *budget* ends a run, never the harness's patience.
	for (let step = 0; step < budgetTicks + 10 && outcome === undefined; step++) {
		const result = await session.step();
		if (result.outcome) outcome = result.outcome;
	}
	if (outcome === undefined) {
		session.stop('the harness gave up');
		outcome = 'STOPPED_BY_USER';
	}
	await flush();
	await writing;

	const finishedAt = now();
	const run = runRecordFrom({
		runId: session.runId,
		spec,
		events,
		packVersions: versions,
		startedAt,
		finishedAt,
		outcome
	});
	await storage.putRun(run);
	await storage.putRunSummary(summariseRun(session.runId, events));

	// The export the Workshop imports — redacted against every secret this
	// process holds, exactly as the browser redacts against its vault.
	const trace = await buildTraceFile(run, events, { secrets: options.credentials.secrets() });
	const traceFile = join(
		options.out,
		'runs',
		session.runId,
		`${session.runId}.craftabot-trace.json`
	);
	await writeFile(traceFile, `${JSON.stringify(trace, null, '\t')}\n`, 'utf8');

	return {
		runId: session.runId,
		agentId: spec.id,
		goalCardId: spec.goalCardId,
		outcome,
		ticks: run.ticks,
		events: events.length,
		directory: join(options.out, 'runs', session.runId),
		traceFile,
		providerId
	};
}

async function loadSpec(options: RunKitOptions, registry: PackRegistry): Promise<AgentSpecV2> {
	let json: unknown;
	try {
		json = JSON.parse(await readFile(options.kitPath, 'utf8'));
	} catch (error) {
		throw new Error(
			`could not read the kit file at ${options.kitPath}: ${error instanceof Error ? error.message : String(error)}`,
			{ cause: error }
		);
	}
	const imported = importKitFile(json, {
		installedPacks: options.config.packs.map((pack) => pack.id),
		installedBrickKinds: registry.listBrickKinds().map((kind) => kind.id)
	});
	if (!imported.ok) throw new Error(imported.problem.message);

	const spec = imported.imported.spec;
	if (options.card === undefined) return spec;
	if (!registry.getGoalCard(options.card)) {
		throw new Error(
			`no goal card '${options.card}' is installed — try one of: ${registry
				.listGoalCards()
				.map((card) => card.id)
				.join(', ')}`
		);
	}
	return { ...spec, goalCardId: options.card };
}

function chooseBrain(
	spec: AgentSpecV2,
	registry: PackRegistry,
	options: RunKitOptions
): { provider: LLMProvider; providerId: string } {
	if (options.brain !== 'live') {
		let plan;
		try {
			plan = planFor(spec.goalCardId);
		} catch {
			throw new Error(
				`no scripted plan exists for '${spec.goalCardId}' — the scripted brains only know the starter pack's cards; use --brain live`
			);
		}
		const script =
			options.brain === 'scripted-noisy'
				? scriptedNoisy(plan, { seed: options.seed })
				: scriptedOptimal(plan);
		return {
			provider: createMockProvider({ script, id: options.brain }),
			providerId: options.brain
		};
	}

	const cartridgeId = slotConfig(spec, registry, 'brain', brainSlotSchema)?.cartridgeId ?? '';
	const cartridge = registry.getCartridge(cartridgeId);
	if (!cartridge)
		throw new Error(`the kit's brain names no installed cartridge ('${cartridgeId}')`);
	const factory = registry.getProviderFactory(cartridge.providerId);
	if (!factory)
		throw new Error(
			`no provider '${cartridge.providerId}' is installed for cartridge ${cartridge.id}`
		);
	if (options.provider !== undefined && options.provider !== factory.id) {
		throw new Error(
			`--provider ${options.provider} does not match the kit's cartridge ${cartridge.id}, which belongs to ${factory.id}`
		);
	}
	let apiKey = '';
	if (factory.keyRequirement === 'required') {
		const key = options.credentials.get(factory.id);
		if (key === undefined) {
			throw new Error(`provider ${factory.id} needs a key: set ${credentialVariable(factory.id)}`);
		}
		apiKey = key;
	}
	const provider = factory.create({ apiKey, ...(options.fetch ? { fetch: options.fetch } : {}) });
	return { provider, providerId: factory.id };
}

function budgetOf(events: readonly EngineEvent[]): number | undefined {
	const started = events.find((event) => event.type === 'run.started');
	return started?.type === 'run.started' ? started.payload.budgets.maxTicks : undefined;
}
