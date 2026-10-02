import { z } from 'zod';
import {
	brainTurnsThrough,
	buildDigest,
	createEventBus,
	createPackRegistry,
	createSession,
	createSessionGroup,
	forkSession,
	stackSchema,
	toSpecV2,
	type AgentSpec,
	type AgentSpecV2,
	type BrickKindDefinition,
	type EngineEvent,
	type Guardrail,
	type PackManifest,
	type PackRegistry,
	type ProviderFault,
	type Principal,
	type Reader,
	type ReaderExecutor,
	type ServiceLine,
	type StageSpec,
	type TypedQuestion,
	type WorkItem,
	type WorkflowSpec,
	type WorldDefinition,
	type WorldInstance
} from '@craftabot/core';
import {
	createMockProvider,
	createTestClock,
	obedient,
	turn,
	v1BrickKinds,
	type MockTurn
} from '@craftabot/core/testing';
import { TEST_DESK_ID, testDesk } from '@craftabot/desk/testing';
import { GATE_CONTENT, createGate } from '@craftabot/gate';
import starterPack from '@craftabot/pack-starter';
import {
	TIDY_TOGETHER_SEAT_A,
	TIDY_TOGETHER_SEAT_B,
	buildRegistry as buildPlayroomRegistry,
	buildSpec,
	type Plan
} from '@craftabot/pack-starter/testing';
import { runWorkflow } from '@craftabot/workflow';

/**
 * **Sensor fixtures** (WP159, `112-REAL-ENOUGH-PLAN.md` §5): a handful of
 * small, deterministic, in-process runs that make the engine's rarer events
 * fire, so the sensor coverage test can say each one *has* fired rather than
 * that no campaign happens to reach it. Nothing here touches the network, the
 * clock or a file; each fixture hands back the events it produced and the
 * `covers` it claims — event types, or `type.field` for an optional payload
 * field — which the test holds it to.
 *
 * `think.token` is producible after all: the mock provider streams.
 */
export interface SensorFixture {
	id: string;
	/** Event types and `type.field` names this fixture makes appear. */
	covers: string[];
	events: EngineEvent[];
}

const PERSON: Principal = { kind: 'person', id: 'reviewer-1', name: 'R. Viewer' };
const SERVICE: Principal = { kind: 'service', id: 'craftabot-harness', name: 'sensor fixtures' };

// ── A tiny world, the way `core`'s own tests build one ─────────────────────

function tinyWorld(): WorldDefinition {
	return {
		id: 'tiny/world',
		name: 'Tiny world',
		layouts: [{ id: 'only', name: 'Only layout', initialState: { pings: 0, won: false } }],
		actions: [
			{
				id: 'ping',
				name: 'Ping',
				description: 'Make a small noise.',
				parameters: { type: 'object' }
			},
			{ id: 'win', name: 'Win', description: 'Finish the goal.', parameters: { type: 'object' } },
			{
				id: 'flop',
				name: 'Flop',
				description: 'Try something the world always refuses.',
				parameters: { type: 'object' }
			}
		],
		senses: [{ id: 'look', name: 'Look', description: 'See the world.' }],
		predicates: { 'has-won': 'The goal is met.' },
		create(): WorldInstance {
			const state = { pings: 0, won: false, heard: [] as string[] };
			return {
				snapshot: () => ({ ...state, heard: [...state.heard] }),
				receiveInput: (text: string) => void state.heard.push(text),
				observe: (channels) => ({
					channels: [...channels],
					text: `pings: ${state.pings}`,
					summary: `pings ${state.pings}`,
					data: {}
				}),
				perform: (action) => {
					if (action.name === 'ping') {
						state.pings += 1;
						return { ok: true, narration: 'ping!', stateDiff: [] };
					}
					if (action.name === 'win') {
						state.won = true;
						return {
							ok: true,
							narration: 'you win!',
							stateDiff: [],
							disclosures: [{ id: 'tiny/ask-again', text: 'You can ask us to look at this again.' }]
						};
					}
					return { ok: false, narration: 'you flop, and nothing happens', stateDiff: [] };
				},
				test: (predicate) => predicate === 'has-won' && state.won,
				reset: () => {
					state.pings = 0;
					state.won = false;
					state.heard = [];
				}
			};
		}
	};
}

/** A brick that reports its own state each tick (`brick.state`). */
const reporterBrick: BrickKindDefinition = {
	id: 'test/reporter',
	slot: 'planner',
	name: 'Reporter',
	description: 'test/reporter',
	realName: 'test/reporter',
	realExplanation: 'test/reporter',
	configSchema: z.object({}),
	configVersion: 1,
	defaults: {},
	createRuntime: () => ({ contributeState: () => ({ steps: ['Find the key'], done: [false] }) })
} as BrickKindDefinition;

function tinyRegistry(): PackRegistry {
	const registry = createPackRegistry();
	registry.registerPack({
		id: 'tiny',
		name: 'Tiny pack',
		version: '1.0.0',
		requiresCore: '>=0.0.1',
		worlds: [tinyWorld()],
		tools: [
			{
				id: 'tiny/echo',
				name: 'Echo',
				description: 'Repeats what you give it.',
				parameters: { type: 'object' },
				execute: (args) => ({
					ok: true,
					output: `echo: ${JSON.stringify(args)}`,
					data: { echoed: args }
				})
			},
			{
				id: 'tiny/jot',
				name: 'Jot',
				description: 'Writes a line in the notebook.',
				parameters: { type: 'object' },
				requiresNotebook: true,
				execute: (args, ctx) => {
					ctx.notebook.append(JSON.stringify(args));
					return { ok: true, output: 'noted' };
				}
			}
		],
		brickKinds: [...v1BrickKinds(), reporterBrick],
		cartridges: [
			{
				id: 'tiny/brain',
				providerId: 'mock',
				model: 'tiny-model-1',
				displayName: 'Tiny brain',
				blurb: 'Small.',
				stats: { words: 1, reasoning: 1, speed: 3 },
				costHint: 'low',
				defaults: { temperature: 0, maxTokens: 64 }
			}
		],
		goalCards: [
			{
				id: 'tiny/goal',
				title: 'Win',
				goalText: 'Win the tiny world.',
				worldId: 'tiny/world',
				layoutId: 'only',
				successCondition: 'has-won',
				hints: [],
				teachesConcepts: []
			},
			{
				id: 'tiny/dial-goal',
				title: 'Win, with a dial',
				goalText: 'Win the tiny world.',
				worldId: 'tiny/world',
				layoutId: 'only',
				successCondition: 'has-won',
				hints: [],
				teachesConcepts: [],
				dial: { knob: 'threshold', label: 'Sure', min: 0, max: 1, step: 0.05, default: 0.5 }
			}
		]
	});
	return registry;
}

function tinySpec(
	goalCardId: string,
	tools: string[] = [],
	id = '11111111-1111-4111-8111-111111111111'
): AgentSpec {
	return {
		id,
		name: 'Tinybot',
		bricks: {
			llm: { cartridgeId: 'tiny/brain', temperature: 0, maxTokens: 64, personality: '' },
			sense: { channels: ['look'] },
			actions: { enabled: ['ping', 'win', 'flop'] },
			memory: { windowSize: 10, notebook: true },
			...(tools.length > 0 ? { tools: { enabled: tools } } : {})
		},
		goalCardId,
		createdAt: '2026-10-02T09:00:00Z',
		updatedAt: '2026-10-02T09:00:00Z',
		schemaVersion: 1
	};
}

interface TinyRun {
	spec: AgentSpec | AgentSpecV2;
	script: MockTurn[];
	guardrails?: Guardrail[];
	principal?: Principal;
	egress?: 'declared' | 'none';
	validated?: { digest: string; source?: string };
	providerFaults?: ProviderFault[];
	budgets?: { maxTicks?: number };
	/** Answers an approval; absent, nobody is asked. */
	approve?: { approved: boolean; by?: Principal };
}

function tinySession(run: TinyRun, events: EngineEvent[]) {
	const clock = createTestClock();
	const session = createSession({
		spec: run.spec,
		registry: tinyRegistry(),
		provider: createMockProvider({ script: run.script }),
		guardrails: run.guardrails ?? [],
		options: {
			now: clock.now,
			newId: clock.newId,
			random: clock.random,
			...(run.budgets ? { budgets: run.budgets } : {}),
			...(run.principal ? { principal: run.principal } : {}),
			...(run.egress ? { egress: run.egress } : {}),
			...(run.validated ? { validated: run.validated } : {}),
			...(run.providerFaults ? { providerFaults: run.providerFaults } : {})
		}
	});
	session.events.onAny((event) => events.push(event));
	if (run.approve) {
		const { approved, by } = run.approve;
		session.events.on('approval.requested', () => session.resolveApproval(approved, by));
	}
	return session;
}

const allowAll: Guardrail = {
	id: 'sensors/allow',
	name: 'Allow',
	description: 'Allows every act, so an attestation has a guard to name.',
	hooks: ['pre-act'],
	check: () => ({ allow: true })
};

// ── Fixture: the loop's rarer corners ──────────────────────────────────────

/**
 * One run with a principal, a stated egress mode, a card dial, a changed
 * build, a planner reporting state, a tool, a planted fault, a provider fault
 * on cue, a message to the bot, a notebook write after an unquarantined mark,
 * and a declared outcome with its reason.
 */
async function loopCorners(): Promise<SensorFixture> {
	const events: EngineEvent[] = [];
	const base = toSpecV2(tinySpec('tiny/dial-goal', ['tiny/echo', 'tiny/jot']));
	const spec: AgentSpecV2 = { ...base, goalDial: 0.7 };
	spec.bricks.push({ slot: 'planner', kind: 'test/reporter', configVersion: 1, config: {} });
	const markPing: Guardrail = {
		id: 'sensors/mark',
		name: 'Mark',
		description: 'Marks the ping’s result untrusted, without a replacement.',
		hooks: ['post-act'],
		check: (ctx) =>
			Promise.resolve(
				ctx.result?.name === 'ping'
					? {
							allow: true,
							verdictKind: 'annotate' as const,
							mark: { provenance: 'untrusted' as const, source: 'tool:ping' }
						}
					: { allow: true }
			)
	};
	const session = tinySession(
		{
			spec,
			script: [
				turn('Echo.', 'echo', { word: 'hello' }),
				{
					...turn('Ping.', 'ping', { outcome: 'decline' }),
					fault: { field: 'outcome', chose: 'decline', shouldHave: 'approve', errorModel: 'm/err' }
				},
				turn('Note it.', 'jot', { line: 'two' })
			],
			guardrails: [allowAll, markPing],
			principal: SERVICE,
			egress: 'none',
			validated: { digest: 'a'.repeat(64), source: 'sensor fixture' },
			// The first think is tick 1; a fault at tick 2 sleeps through the second step.
			providerFaults: [{ kind: 'provider-fault', atTick: 2, fault: 'timeout', count: 1 }],
			budgets: { maxTicks: 6 }
		},
		events
	);
	// Built to be a different build from the one `validated` names.
	if (buildDigest(spec) === 'a'.repeat(64)) throw new Error('digest collision');
	session.start('step');
	await session.step();
	session.deliverInput('Teddy says hello');
	await session.step();
	await session.step();
	session.declareOutcome('SUCCESS', 'the fixture said it was finished');
	return {
		id: 'loop-corners',
		covers: [
			'run.started.egress',
			'run.started.principal',
			'run.started.goalDial',
			'run.started.changed',
			'run.finished.reason',
			'tool.executed',
			'tool.executed.data',
			'brick.state',
			'decision.fault',
			'decision.fault.errorModel',
			'action.performed.attestation',
			'memory.updated.source',
			'input.delivered',
			'provider.retried',
			'error',
			'error.kind',
			'think.token',
			'envelope.agentId'
		],
		events
	};
}

// ── Fixture: the guard chain's rarer verdicts ──────────────────────────────

async function guardChain(): Promise<SensorFixture> {
	const events: EngineEvent[] = [];
	const componentPoint = { componentId: 'sensors/component', point: { kind: 'pre-act' } };
	const hosted: Guardrail = {
		id: 'sensors/hosted',
		name: 'Hosted',
		description: 'A hosted guard that reports its own call.',
		hooks: ['pre-think'],
		check: () => ({ allow: true }),
		checkWithRecord: () =>
			Promise.resolve({
				verdict: { allow: true },
				external: {
					service: 'model-armor',
					method: 'sanitizeUserPrompt',
					endpoint: 'https://modelarmor.example.test/v1/…:sanitizeUserPrompt',
					template: 'cab-armour',
					policyRef: 'templates/cab-armour@1',
					latencyMs: 37,
					charsScreened: 42,
					outcome: 'ok' as const,
					filters: { pi_and_jailbreak: { ran: true, matched: false, confidence: 'low' } }
				}
			})
	};
	const failClosed: Guardrail = {
		id: 'sensors/fail-closed',
		name: 'Fail closed',
		description: 'Blocks a flop, because it could not check.',
		hooks: ['pre-act'],
		policyCardId: 'sensors/policy/no-flop',
		...componentPoint,
		check: (ctx) =>
			ctx.proposed?.name === 'flop'
				? {
						allow: false,
						reason: 'the service could not be reached',
						disposition: 'block-action',
						cause: 'could-not-check'
					}
				: { allow: true }
	};
	const redactor: Guardrail = {
		id: 'sensors/scrub',
		name: 'Scrub',
		description: 'Rewrites the card number.',
		hooks: ['pre-act'],
		check: (ctx) => {
			const text = (ctx.proposed?.arguments as { text?: unknown } | undefined)?.text;
			return Promise.resolve(
				typeof text === 'string' && text.includes('4111')
					? {
							allow: true,
							verdictKind: 'redact' as const,
							redactedText: text.replace(/4111[ \d]*/, '[card redacted]'),
							finding: { category: 'sensitive-data', label: 'pan' }
						}
					: { allow: true }
			);
		}
	};
	const quarantine: Guardrail = {
		id: 'sensors/quarantine',
		name: 'Quarantine',
		description: 'Marks every result untrusted, with a replacement.',
		hooks: ['post-act'],
		check: (ctx) =>
			Promise.resolve(
				ctx.result
					? {
							allow: true,
							verdictKind: 'annotate' as const,
							mark: {
								provenance: 'untrusted' as const,
								source: `tool:${ctx.result.name}`,
								replacement: 'withheld by the reader'
							}
						}
					: { allow: true }
			)
	};
	const elevate: Guardrail = {
		id: 'sensors/scopes',
		name: 'Scopes',
		description: 'Asks to elevate before a win.',
		hooks: ['pre-act'],
		check: (ctx) =>
			ctx.proposed?.name === 'win'
				? { pause: true, reason: 'win is not granted', elevation: { scope: 'win' } }
				: { allow: true }
	};
	const session = tinySession(
		{
			spec: tinySpec('tiny/goal'),
			script: [
				turn('Say it.', 'ping', { text: 'the card is 4111 1111 1111 1111' }),
				turn('Flop.', 'flop'),
				turn('Win.', 'win')
			],
			guardrails: [hosted, failClosed, redactor, quarantine, elevate],
			principal: SERVICE,
			approve: { approved: true, by: PERSON },
			budgets: { maxTicks: 5 }
		},
		events
	);
	session.start('step');
	for (let step = 0; step < 3; step += 1) await session.step();
	return {
		id: 'guard-chain',
		covers: [
			'guardrail.external',
			'guardrail.external.method',
			'guardrail.external.template',
			'guardrail.external.policyRef',
			'guardrail.external.filters',
			'guardrail.tripped',
			'guardrail.tripped.disposition',
			'guardrail.tripped.cause',
			'guardrail.tripped.policyCardId',
			'guardrail.tripped.componentId',
			'guardrail.tripped.point',
			'action.performed.redacted',
			'content.marked',
			'disclosure.given',
			'elevation.requested',
			'elevation.resolved',
			'elevation.resolved.by',
			'approval.resolved.by'
		],
		events
	};
}

// ── Fixture: a fork and a group, which carry a parent ──────────────────────

async function forked(): Promise<SensorFixture> {
	const spec = tinySpec('tiny/goal');
	const script = [turn('Ping once.', 'ping'), turn('Ping again.', 'ping'), turn('Win.', 'win')];
	const origin: EngineEvent[] = [];
	const first = tinySession({ spec, script }, origin);
	first.start('step');
	for (let step = 0; step < 3; step += 1) await first.step();

	const events: EngineEvent[] = [];
	const clock = createTestClock({ idOffset: 500 });
	const fork = forkSession(
		{
			spec,
			registry: tinyRegistry(),
			provider: createMockProvider({ script, startAt: brainTurnsThrough(origin, 1) }),
			guardrails: [],
			options: { now: clock.now, newId: clock.newId, random: clock.random }
		},
		{ from: { events: origin, tick: 1 } }
	);
	fork.events.onAny((event) => events.push(event));
	fork.start('step');
	for (let step = 0; step < 3; step += 1) if ((await fork.step()).outcome) break;
	return {
		id: 'fork',
		covers: ['run.started.forkedFrom', 'envelope.parentRunId'],
		events
	};
}

async function group(): Promise<SensorFixture> {
	const clock = createTestClock();
	const events: EngineEvent[] = [];
	const seat = (id: string, plan: Plan) => ({
		spec: buildSpec({ id, goalCardId: 'starter/tidy-together' }),
		provider: createMockProvider({ script: obedient(plan) }),
		role: 'agent' as const
	});
	const together = createSessionGroup({
		members: [
			seat('11111111-1111-4111-8111-111111111111', TIDY_TOGETHER_SEAT_A),
			seat('22222222-2222-4222-8222-222222222222', TIDY_TOGETHER_SEAT_B)
		],
		registry: buildPlayroomRegistry(),
		goalCardId: 'starter/tidy-together',
		options: { now: clock.now, newId: clock.newId, random: clock.random, principal: PERSON }
	});
	together.events.onAny((event) => events.push(event));
	together.start('step');
	await together.stepRound();
	together.stop('the fixture stopped the group');
	return {
		id: 'group',
		covers: [
			'group.started',
			'group.started.memberRoles',
			'group.started.principal',
			'group.finished',
			'group.finished.reason',
			'envelope.parentRunId'
		],
		events
	};
}

// ── Fixtures: the workflow's rarer events ──────────────────────────────────

const ANY = { type: 'object' };
const SIGNED = {
	type: 'object',
	required: ['signedIn'],
	properties: { signedIn: { type: 'boolean' } },
	additionalProperties: false
};
const ITEM: WorkItem = {
	id: 'item-1',
	kind: 'application',
	customerId: 'customer-1',
	arrivedAt: '2026-01-05T09:00:00Z',
	payload: { visitor: 'A. Person' },
	truth: { records: [] }
};
const WORKFLOW_SPEC: AgentSpec = {
	id: '33333333-3333-4333-8333-333333333333',
	name: 'Deskbot',
	bricks: {
		llm: { cartridgeId: 'test/brain', temperature: 0, maxTokens: 64, personality: '' },
		sense: { channels: ['conversation', 'case-file', 'queue'] },
		actions: { enabled: ['say', 'look-up', 'sign-in'] },
		memory: { windowSize: 10, notebook: false }
	},
	goalCardId: 'test/sign-in',
	createdAt: '2026-09-05T09:00:00Z',
	updatedAt: '2026-09-05T09:00:00Z',
	schemaVersion: 1
};

const echoLine: ServiceLine = {
	id: 'test/echo',
	name: 'Echo',
	description: 'Answers with what it was asked.',
	operations: [
		{ id: 'ping', name: 'Ping', description: 'Echo the arguments.', riskTier: 'observe' }
	],
	simulate: (op, args) =>
		op === 'ping'
			? { ok: true, output: 'pong', data: { echoed: args } }
			: { ok: false, output: `no ${op}`, errorKind: 'unknown-operation' }
};

const rates = (id: string, distribution: Record<string, number>) => ({
	id,
	kind: 'rates' as const,
	title: id,
	distribution,
	source: { kind: 'assumption' as const, retrieved: '2026-10-02' },
	note: 'A fixture row.',
	tolerance: 0.01,
	review: 'pending' as const
});

/** The desk pack, with a reviewer model who is always right and never follows a wrong recommendation. */
function deskPack(readers: Reader[] = []): PackManifest {
	return {
		id: 'test',
		name: 'Test desk pack',
		version: '1.0.0',
		requiresCore: '>=1.0.0',
		worlds: [testDesk],
		brickKinds: v1BrickKinds(),
		cartridges: [
			{
				id: 'test/brain',
				providerId: 'mock',
				model: 'mock-1',
				displayName: 'Mock brain',
				blurb: 'Scripted.',
				stats: { words: 1, reasoning: 1, speed: 3 },
				costHint: 'low',
				defaults: { temperature: 0, maxTokens: 64 }
			}
		],
		serviceLines: [echoLine],
		calibrations: [
			{
				id: 'sensors/rows',
				title: 'Sensor fixture rows',
				description: 'The reviewer fixture’s rows.',
				rows: [
					rates('accuracy', { correct: 1 }),
					rates('bias', { follows: 0 }),
					{ ...rates('seconds', { '60': 1 }), kind: 'weights' as const }
				]
			}
		],
		reviewerModels: [
			{
				id: 'sensors/reviewer',
				name: 'Fixture reviewer',
				description: 'Always right.',
				accuracy: { table: 'sensors/rows', row: 'accuracy', key: 'correct' },
				automationBias: { table: 'sensors/rows', row: 'bias', key: 'follows' },
				secondsPerCase: { table: 'sensors/rows', row: 'seconds', key: 'seconds' }
			}
		],
		...(readers.length > 0 ? { readers } : {})
	};
}

function deskWorkflow(stages: StageSpec[], extra: Partial<WorkflowSpec> = {}): WorkflowSpec {
	return {
		id: 'test/visit',
		name: 'A visit',
		worldId: TEST_DESK_ID,
		purpose: 'Sign a visitor in',
		intake: (item) => ({ layoutId: 'one-visitor', input: item.payload }),
		stages,
		first: stages[0]?.id ?? 'end',
		obligations: [],
		...extra
	};
}

function runDesk(
	spec: WorkflowSpec,
	extra: Partial<Parameters<typeof runWorkflow>[2]> = {},
	readers: Reader[] = [],
	item: WorkItem = ITEM
) {
	const clock = createTestClock({ idOffset: 1000 });
	return runWorkflow(spec, item, {
		packs: [deskPack(readers)],
		spec: WORKFLOW_SPEC,
		providerFor: () => {
			throw new Error('no agent stage in a sensor fixture');
		},
		now: clock.now,
		newId: clock.newId,
		random: clock.random,
		...extra
	});
}

const greet: StageSpec = {
	id: 'greet',
	name: 'Greet',
	input: ANY,
	output: { type: 'object', required: ['greeted'] },
	executor: { kind: 'rule', rule: 'greet' },
	next: () => 'sign'
};
const signByRule: StageSpec = {
	id: 'sign',
	name: 'Sign in by rule',
	input: ANY,
	output: SIGNED,
	executor: { kind: 'rule', rule: 'sign' },
	next: () => 'end'
};
const RULES: NonNullable<WorkflowSpec['rules']> = {
	greet: () => ({
		output: { greeted: true },
		call: { name: 'say', arguments: { text: 'Hello, who are you here to see?' } }
	}),
	sign: () => ({
		output: { signedIn: true },
		call: { name: 'sign-in', arguments: { visitor: 'A. Person' } }
	})
};
const decide: StageSpec = {
	id: 'decide',
	name: 'Decide',
	input: ANY,
	output: {
		type: 'object',
		required: ['decision'],
		properties: { decision: { enum: ['approve', 'refer'] } }
	},
	executor: { kind: 'human', prompt: 'Approve the visit?', options: ['approve', 'refer'] },
	recommended: () => 'approve',
	next: () => 'end'
};

/** A stage done past its deadline, a person overriding a recommendation with a reason, and a reviewer model answering. */
async function workflowPeople(): Promise<SensorFixture> {
	const late = await runDesk(
		deskWorkflow([greet, { ...signByRule, deadline: { ticks: 1 } }], { rules: RULES })
	);
	const overridden = await runDesk(deskWorkflow([decide]), {
		human: () => ({ decision: 'refer', by: PERSON, reason: 'The visitor’s pass has expired.' })
	});
	const modelled = await runDesk(deskWorkflow([decide]), {
		config: { reviewer: 'sensors/reviewer' }
	});
	return {
		id: 'workflow-people',
		covers: [
			'stage.overdue',
			'approval.resolved.by',
			'approval.resolved.override',
			'approval.resolved.reason',
			'stage.completed.by'
		],
		events: [...late.events, ...overridden.events, ...modelled.events]
	};
}

const COLOUR: TypedQuestion = {
	type: 'choice',
	instructions: 'Which colour is the visitor’s badge?',
	criteria: { red: 'Red', green: 'Green' }
};
const STEER: TypedQuestion = { type: 'noul', instructions: 'Did the visitor tell us the answer?' };

/** A hosted reader that answers a colour and a steer. */
const steeredReader: Reader = {
	id: 'sensors/reader',
	name: 'Steered',
	description: 'Answers a colour and a steer.',
	kind: 'hosted',
	egress: [],
	browserCapable: true,
	answers: ['choice', 'noul'],
	ask: async () => ({
		model: 'test-1',
		method: 'hosted',
		answers: {
			colour: {
				type: 'choice',
				choice: 'red',
				probabilities: { red: 0.9, green: 0.1 },
				confidence: 0.8
			},
			steer: { type: 'noul', noul: 0.2 }
		}
	})
};

async function readerAnswered(): Promise<SensorFixture> {
	const executor: ReaderExecutor = {
		kind: 'reader',
		readerId: 'sensors/reader',
		subject: (input) => input,
		questions: () => ({ colour: COLOUR, steer: STEER }),
		output: (answers) => ({
			colour: answers['colour']?.type === 'choice' ? answers['colour'].choice : 'grey'
		}),
		act: () => ({ name: 'look-up', arguments: { record: 'visitor' } }),
		gate: { threshold: 0.5, else: { kind: 'rule', rule: 'grey-v1' }, steer: 'steer' }
	};
	const spec: WorkflowSpec = deskWorkflow(
		[
			{
				id: 'classify',
				name: 'Read the badge',
				input: { type: 'object' },
				output: {
					type: 'object',
					required: ['colour'],
					properties: { colour: { enum: ['red', 'green', 'grey'] } },
					additionalProperties: false
				},
				executor,
				next: () => 'end'
			}
		],
		{ rules: { 'grey-v1': () => ({ output: { colour: 'grey' } }) } }
	);
	const record = await runDesk(spec, {}, [steeredReader]);
	return {
		id: 'reader-answered',
		covers: ['reader.answered', 'reader.answered.steer', 'reader.answered.stageId'],
		events: record.events
	};
}

// ── Fixture: the Gate's conversation ───────────────────────────────────────

async function gateConversation(): Promise<SensorFixture> {
	const registry = createPackRegistry();
	registry.registerPack(starterPack);
	registry.registerPack(GATE_CONTENT);
	const stack = stackSchema.parse({
		schemaVersion: 1,
		id: 'sensors/stack/gate',
		name: 'A budget',
		description: 'A turn budget.',
		fit: [
			{
				componentId: 'governance/step-budget',
				config: { maxTicks: 4 },
				point: { kind: 'pre-think' }
			}
		],
		provenance: {
			author: { kind: 'service', id: 'sensors/fixture' },
			createdAt: '2026-10-02T00:00:00.000Z'
		}
	});
	let turnNumber = 0;
	const fetch = (async () => {
		turnNumber += 1;
		return new Response(
			JSON.stringify({
				id: `scripted-${turnNumber}`,
				choices: [
					{
						index: 0,
						message: { role: 'assistant', content: 'Done.' },
						finish_reason: 'stop'
					}
				],
				usage: { prompt_tokens: 20, completion_tokens: 2 }
			}),
			{ status: 200 }
		);
	}) as typeof globalThis.fetch;
	const events: EngineEvent[] = [];
	const bus = createEventBus();
	bus.onAny((event) => events.push(event));
	let second = 0;
	let id = 0;
	const gate = createGate({
		stack,
		registry,
		upstream: { baseUrl: 'http://127.0.0.1:8128/v1' },
		mode: 'shadow',
		fetch,
		events: bus,
		principal: SERVICE,
		now: () => new Date(Date.UTC(2026, 9, 2, 9, 0, second++)).toISOString(),
		newId: () => `6a7e0000-0000-4000-8000-${String(++id).padStart(12, '0')}`
	});
	await gate.handle(
		{
			model: 'office-model',
			messages: [
				{ role: 'system', content: 'You are an office assistant.' },
				{ role: 'user', content: 'Hello.' }
			]
		},
		{ 'x-craftabot-conversation': 'office' }
	);
	await gate.end('office');
	return { id: 'gate-conversation', covers: ['run.started.gate'], events };
}

// ── The set ────────────────────────────────────────────────────────────────

/**
 * Every fixture, run: each small, deterministic and in-process, the whole set
 * a few seconds. The events are as the session or the workflow wrote them.
 */
export async function sensorFixtures(): Promise<SensorFixture[]> {
	return [
		await loopCorners(),
		await guardChain(),
		await forked(),
		await group(),
		await workflowPeople(),
		await readerAnswered(),
		await gateConversation()
	];
}
