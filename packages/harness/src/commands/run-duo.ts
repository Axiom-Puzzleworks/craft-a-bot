import {
	createSessionGroup,
	buildTraceFile,
	toSpecV2,
	type AgentRecord,
	type AgentSpec,
	type AgentSpecV2,
	type EngineEvent,
	type GroupRunRecord,
	type LLMProvider,
	type PackRegistry,
	type RunOutcome,
	type WorldDefinition
} from '@craftabot/core';
import { createMockProvider } from '@craftabot/core/testing';
import { scriptedCounterpart } from '@craftabot/evals';
import { summariseRun } from '@craftabot/governance/reports';
import type { CounterpartScript } from '@craftabot/desk';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { packVersions, type HarnessConfig } from '../config.js';
import { credentialVariable, type CredentialSource } from '../credentials.js';
import { mulberry32 } from '../random.js';
import { runRecordFrom } from '../run-record.js';
import { createFileStorage } from '../storage/file-storage.js';
import { bundleGroup } from './bundle.js';

/**
 * **`craftabot run --counterpart`** (WP55 stage C, `46-COUNTERPARTS.md`
 * §4.6): the kit's bot as the clerk and a generated visitor as the second
 * seat of a `SessionGroup` over a desk, the visitor's brain either the
 * `scripted-counterpart` tier along the desk's own script (no key, and the
 * merged stream reproduces from `--seed`) or a live cartridge with the
 * script's persona as its personality. The episode is written the way the
 * Kit's duo writes one — each member's run, the group's record and merged
 * stream — plus a `<groupRunId>.craftabot-bundle.json` the Workshop imports.
 */
export interface CounterpartOptions {
	brain: 'scripted' | 'live';
	/** With `brain: 'live'`, the cartridge the visitor thinks with; default the kit's own. */
	cartridgeId?: string;
}

export interface RunDuoInput {
	spec: AgentSpecV2;
	provider: LLMProvider;
	providerId: string;
	registry: PackRegistry;
	config: HarnessConfig;
	credentials: CredentialSource;
	counterpart: CounterpartOptions;
	seed: number;
	out: string;
	approve?: boolean;
	maxTicks?: number;
	maxRounds?: number;
	now?: () => string;
	newId?: () => string;
	fetch?: typeof globalThis.fetch;
	egress?: 'declared' | 'none';
}

export interface RunDuoReport {
	groupRunId: string;
	runId: string;
	agentId: string;
	counterpartAgentId: string;
	counterpartProviderId: string;
	goalCardId: string;
	outcome: RunOutcome;
	rounds: number;
	/** The clerk's own ticks. */
	ticks: number;
	events: number;
	directory: string;
	bundleFile: string;
	providerId: string;
}

/** The desk's script, or why this card cannot seat a visitor. */
export function counterpartScriptFor(
	registry: PackRegistry,
	goalCardId: string
): { script: CounterpartScript; world: WorldDefinition } {
	const card = registry.getGoalCard(goalCardId);
	const world = card ? registry.getWorld(card.worldId) : undefined;
	if (!card || !world) throw new Error(`no goal card '${goalCardId}' is installed`);
	if (world.view !== 'desk') {
		throw new Error(`--counterpart needs a desk; '${goalCardId}' plays in '${world.id}', a room`);
	}
	const script = (world as { spec?: { counterpart?: CounterpartScript } }).spec?.counterpart;
	if (!script) throw new Error(`the desk '${world.id}' has no counterpart script to seat`);
	return { script, world };
}

/** The visitor's spec (`46-…` §4.6): the conversation and its brief, `say` and `hang-up`, the persona as its personality. */
export function counterpartSpec(
	script: CounterpartScript,
	goalCardId: string,
	worldId: string,
	cartridgeId: string,
	id: string,
	createdAt: string
): AgentSpec {
	return {
		id,
		name: script.name,
		bricks: {
			llm: { cartridgeId, temperature: 0, maxTokens: 256, personality: script.persona },
			// Qualified with the desk's own id: the starter's Sense and Actions
			// bricks qualify a bare id with the Playroom's (`12-…` D20), which
			// would leave the visitor deaf at the desk.
			sense: { channels: [`${worldId}/conversation`, `${worldId}/brief`] },
			actions: { enabled: [`${worldId}/say`, `${worldId}/hang-up`] },
			memory: { windowSize: 10, notebook: false }
		},
		goalCardId,
		createdAt,
		updatedAt: createdAt,
		schemaVersion: 1
	};
}

function counterpartProvider(
	input: RunDuoInput,
	script: CounterpartScript,
	random: () => number
): { provider: LLMProvider; providerId: string; cartridgeId: string } {
	const kitCartridge = input.spec.bricks.find((brick) => brick.slot === 'brain');
	const kitCartridgeId =
		(kitCartridge?.config as { cartridgeId?: string } | undefined)?.cartridgeId ?? '';
	if (input.counterpart.brain === 'scripted') {
		return {
			provider: createMockProvider({
				id: 'scripted-counterpart',
				script: scriptedCounterpart(script, { selfName: script.name, random })
			}),
			providerId: 'scripted-counterpart',
			cartridgeId: kitCartridgeId
		};
	}
	const cartridgeId = input.counterpart.cartridgeId ?? kitCartridgeId;
	const cartridge = input.registry.getCartridge(cartridgeId);
	if (!cartridge)
		throw new Error(`--counterpart-cartridge names no installed cartridge ('${cartridgeId}')`);
	const factory = input.registry.getProviderFactory(cartridge.providerId);
	if (!factory)
		throw new Error(`no provider '${cartridge.providerId}' is installed for ${cartridge.id}`);
	let apiKey = '';
	if (factory.keyRequirement === 'required') {
		const key = input.credentials.get(factory.id);
		if (key === undefined) {
			throw new Error(
				`the visitor's cartridge ${cartridge.id} needs ${credentialVariable(factory.id)} in the environment`
			);
		}
		apiKey = key;
	}
	return {
		provider: factory.create({ apiKey, ...(input.fetch ? { fetch: input.fetch } : {}) }),
		providerId: factory.id,
		cartridgeId
	};
}

export async function runKitDuo(input: RunDuoInput): Promise<RunDuoReport> {
	const { script, world } = counterpartScriptFor(input.registry, input.spec.goalCardId);
	const now = input.now ?? (() => new Date().toISOString());
	const newId = input.newId ?? (() => crypto.randomUUID());
	const random = mulberry32(input.seed);
	const visitorBrain = counterpartProvider(input, script, mulberry32(input.seed ^ 0x9e3779b9));
	const visitor = counterpartSpec(
		script,
		input.spec.goalCardId,
		world.id,
		visitorBrain.cartridgeId,
		newId(),
		now()
	);
	const storage = await createFileStorage(input.out);
	const versions = packVersions(input.config);

	const group = createSessionGroup({
		members: [
			{ spec: input.spec, provider: input.provider, role: 'agent' },
			{ spec: visitor, provider: visitorBrain.provider, role: 'counterpart' }
		],
		registry: input.registry,
		goalCardId: input.spec.goalCardId,
		options: {
			now,
			newId,
			random,
			tickDelayMs: 0,
			...(input.fetch ? { fetch: input.fetch } : {}),
			egress: input.egress ?? 'declared',
			...(input.maxTicks !== undefined ? { budgets: { maxTicks: input.maxTicks } } : {}),
			maxRounds: input.maxRounds ?? 30
		}
	});

	const specs: Array<[string, AgentSpecV2 | AgentSpec]> = [
		[input.spec.id, input.spec],
		[visitor.id, visitor]
	];
	for (const [id, spec] of specs) {
		const agent: AgentRecord = {
			id,
			// The store keeps v2 specs only; the generated visitor is written in v1 and converted here.
			spec: toSpecV2(spec),
			lastValidation: [],
			createdAt: spec.createdAt,
			updatedAt: spec.updatedAt,
			schemaVersion: 2
		};
		await storage.putAgent(agent);
	}

	const merged: EngineEvent[] = [];
	const perMember = new Map<string, EngineEvent[]>();
	let writing: Promise<void> = Promise.resolve();
	const startedAt = now();
	group.events.onAny((event) => {
		merged.push(event);
		if (event.agentId !== undefined) {
			const own = perMember.get(event.agentId) ?? [];
			own.push(event);
			perMember.set(event.agentId, own);
		}
	});
	for (const session of group.sessions) {
		session.events.on('approval.requested', () => session.resolveApproval(input.approve ?? true));
	}

	group.start('step');
	let outcome: RunOutcome | undefined;
	let rounds = 0;
	for (let round = 0; round < (input.maxRounds ?? 30) + 2 && outcome === undefined; round += 1) {
		const result = await group.stepRound();
		rounds = result.round;
		if (result.outcome) outcome = result.outcome;
	}
	if (outcome === undefined) {
		group.stop('the harness gave up');
		outcome = 'STOPPED_BY_USER';
	}
	const finishedAt = now();

	// Every member's run, then the group's own stream and record — the Kit's duo route's order.
	const memberRunIds: string[] = [];
	// Sessions come back in member order (`SessionGroup.sessions`), which is the specs' order.
	for (const [index, session] of group.sessions.entries()) {
		const [agentId, spec] = specs[index] ?? specs[0]!;
		const own = perMember.get(agentId) ?? [];
		writing = writing.then(() => storage.appendEvents(session.runId, own));
		await writing;
		const finished = own.find((event) => event.type === 'run.finished');
		const memberOutcome = finished?.type === 'run.finished' ? finished.payload.outcome : outcome;
		const run = runRecordFrom({
			runId: session.runId,
			spec: spec as AgentSpecV2,
			events: own,
			packVersions: versions,
			startedAt,
			finishedAt,
			outcome: memberOutcome
		});
		await storage.putRun({ ...run, groupRunId: group.groupRunId });
		await storage.putRunSummary(summariseRun(session.runId, own));
		const trace = await buildTraceFile({ ...run, groupRunId: group.groupRunId }, own, {
			secrets: input.credentials.secrets()
		});
		await writeFile(
			join(input.out, 'runs', session.runId, `${session.runId}.craftabot-trace.json`),
			`${JSON.stringify(trace, null, '\t')}\n`,
			'utf8'
		);
		memberRunIds.push(session.runId);
	}
	await storage.appendEvents(group.groupRunId, merged);
	const usage = [...perMember.values()].flat().reduce(
		(sum, event) =>
			event.type === 'think.completed'
				? {
						inputTokens: sum.inputTokens + event.payload.response.usage.inputTokens,
						outputTokens: sum.outputTokens + event.payload.response.usage.outputTokens
					}
				: sum,
		{ inputTokens: 0, outputTokens: 0 }
	);
	const record: GroupRunRecord = {
		id: group.groupRunId,
		goalCardId: input.spec.goalCardId,
		memberRunIds,
		memberAgentIds: specs.map(([id]) => id),
		outcome,
		rounds,
		usage,
		pinned: false,
		startedAt,
		finishedAt,
		schemaVersion: 1
	};
	await storage.putGroupRun(record);

	const bundle = await bundleGroup(storage, group.groupRunId, input.credentials.secrets());
	const bundleFile = join(
		input.out,
		'runs',
		group.groupRunId,
		`${group.groupRunId}.craftabot-bundle.json`
	);
	await writeFile(bundleFile, `${JSON.stringify(bundle, null, '\t')}\n`, 'utf8');

	return {
		groupRunId: group.groupRunId,
		runId: memberRunIds[0] ?? '',
		agentId: input.spec.id,
		counterpartAgentId: visitor.id,
		counterpartProviderId: visitorBrain.providerId,
		goalCardId: input.spec.goalCardId,
		outcome,
		rounds,
		ticks: (perMember.get(input.spec.id) ?? []).filter((event) => event.type === 'tick.completed')
			.length,
		events: merged.length,
		directory: join(input.out, 'runs', group.groupRunId),
		bundleFile,
		providerId: input.providerId
	};
}
