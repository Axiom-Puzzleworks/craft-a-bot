import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
	canonicalJson,
	contextSpecFor,
	safeParseEngineEvent,
	sha256Hex,
	workflowRunSchema,
	type AgentSpec,
	type DeskWorldState,
	type EngineEvent,
	type PackManifest,
	type ServiceLine,
	type StageSpec,
	type WorkItem,
	type WorkflowSpec
} from '@craftabot/core';
import {
	createMockProvider,
	createTestClock,
	obedient,
	v1BrickKinds
} from '@craftabot/core/testing';
import { describe, expect, it } from 'vitest';
import { TEST_DESK_ID, testDesk } from '@craftabot/desk/testing';
import { VALUE_CAP, configRecord, runWorkflow, stagePack, stageValue } from './run.js';

/**
 * WP79 stage B (`69-WORKFLOWS.md` §7): the runtime over the desk golden
 * trace. Built exactly as `packages/desk`'s `golden-trace.test.ts` builds its
 * registry, so an agent stage's trace can be held to the committed fixture
 * byte for byte — plus the two `stage.*` events, and nothing else.
 */
const FIXTURE = fileURLToPath(
	new URL('../../desk/src/fixtures/trace.desk-minimal.v1.json', import.meta.url)
);

function testPack(): PackManifest {
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
		serviceLines: [echoLine()]
	};
}

function echoLine(): ServiceLine {
	return {
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
}

const SPEC: AgentSpec = {
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

const PLAN = [
	{
		say: 'Someone is here. Hello.',
		call: 'say',
		args: { text: 'Hello, who are you here to see?' }
	},
	{ say: 'Let me open their record.', call: 'look-up', args: { record: 'visitor' } },
	{ say: 'Signing them in.', call: 'sign-in', args: { visitor: 'A. Person' } }
];

const ITEM: WorkItem = {
	id: 'item-1',
	kind: 'application',
	customerId: 'customer-1',
	arrivedAt: '2026-01-05T09:00:00Z',
	payload: { visitor: 'A. Person' },
	truth: { records: [] }
};

const ANY = { type: 'object' };
const SIGNED = {
	type: 'object',
	required: ['signedIn'],
	properties: { signedIn: { type: 'boolean' } },
	additionalProperties: false
};

const signInStage: StageSpec = {
	id: 'sign-in',
	name: 'Sign the visitor in',
	input: ANY,
	output: SIGNED,
	executor: {
		kind: 'agent',
		until: 'signed-in',
		goalText: 'Find out who has come and sign them in.'
	},
	read: (state) => {
		const desk = state as DeskWorldState;
		return desk.queue[0]?.status === 'decided' ? { signedIn: true } : undefined;
	},
	next: () => 'end'
};

function workflow(stages: StageSpec[], extra: Partial<WorkflowSpec> = {}): WorkflowSpec {
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

function run(spec: WorkflowSpec, extra: Partial<Parameters<typeof runWorkflow>[2]> = {}) {
	const workflowClock = createTestClock({ idOffset: 1000 });
	const sessionClock = createTestClock();
	const traces: { stageId: string; events: EngineEvent[] }[] = [];
	return runWorkflow(spec, ITEM, {
		packs: [testPack()],
		spec: SPEC,
		providerFor: () => createMockProvider({ script: obedient(PLAN) }),
		now: workflowClock.now,
		newId: workflowClock.newId,
		random: workflowClock.random,
		session: { now: sessionClock.now, newId: sessionClock.newId, random: sessionClock.random },
		onAgentRun: (agentRun) => traces.push({ stageId: agentRun.stageId, events: agentRun.events }),
		...extra
	}).then((record) => ({ record, traces }));
}

describe('an agent stage over the desk golden trace', () => {
	it('reproduces the session trace byte for byte plus only the two stage events', async () => {
		const { record, traces } = await run(workflow([signInStage]));
		expect(record.outcome).toBe('completed');
		expect(record.stages).toHaveLength(1);
		expect(record.stages[0]).toMatchObject({
			stageId: 'sign-in',
			status: 'ok',
			startedTick: 0,
			endedTick: 3,
			output: { value: { signedIn: true } },
			guards: { checked: 0, tripped: [] }
		});
		const trace = traces[0]?.events ?? [];
		const stageEvents = trace.filter((event) => event.type.startsWith('stage.'));
		expect(stageEvents.map((event) => [event.type, event.tick])).toEqual([
			['stage.started', 0],
			['stage.completed', 3]
		]);
		expect(trace[0]?.type).toBe('stage.started');
		expect(trace.at(-1)?.type).toBe('stage.completed');
		const rest = trace.filter((event) => !event.type.startsWith('stage.'));
		expect(JSON.stringify(rest, null, '\t')).toBe(readFileSync(FIXTURE, 'utf8'));
		expect(record.runIds).toEqual([trace[0]?.runId]);
		expect(record.stages[0]?.runId).toBe(trace[0]?.runId);
		for (const event of stageEvents) expect(safeParseEngineEvent(event).success).toBe(true);
		// The stage events are stamped by the workflow's own clock, not the session's.
		expect(stageEvents[0]?.id).toBe('00000000-0000-4000-8000-0000000003ea');
	});

	it('is a valid workflow run whose digest is over the stage records', async () => {
		const { record } = await run(workflow([signInStage]));
		expect(workflowRunSchema.safeParse(JSON.parse(JSON.stringify(record))).success).toBe(true);
		expect(record.digest).toBe(sha256Hex(canonicalJson(record.stages)));
		expect(record.events.map((event) => event.type)).toEqual([]);
		expect(record.workflowId).toBe('test/visit');
		expect(record.itemId).toBe('item-1');
	});

	it('is an error with a finding when the bot ends without producing the output', async () => {
		const consulted: StageSpec = {
			...signInStage,
			id: 'consult',
			read: (state) =>
				(state as DeskWorldState & { extra: { consulted: number } }).extra.consulted > 0
					? { signedIn: true }
					: undefined
		};
		const { record } = await run(workflow([consulted]));
		expect(record.outcome).toBe('stopped');
		expect(record.stages[0]).toMatchObject({
			status: 'error',
			finding: 'the stage ended without producing its output'
		});
	});

	it('is an error when the run ends out of steps', async () => {
		const short: StageSpec = {
			...signInStage,
			executor: { kind: 'agent', until: 'signed-in', maxTicks: 1 }
		};
		// `goalText` left off: the default brief is the purpose and the stage's name.
		const { record, traces } = await run(workflow([short]));
		expect(record.stages[0]).toMatchObject({
			status: 'error',
			finding: 'the run ended OUT_OF_STEPS'
		});
		expect(record.stages[0]?.executor).toEqual({ kind: 'agent', until: 'signed-in', maxTicks: 1 });
		expect(
			traces[0]?.events.some((event) =>
				JSON.stringify(event).includes('Sign a visitor in — Sign the visitor in.')
			)
		).toBe(true);
	});

	it('fails the stage, not the run, when the output has the wrong shape', async () => {
		const wrong: StageSpec = { ...signInStage, read: () => ({ signedIn: 'yes' }) };
		const { record } = await run(workflow([wrong]));
		expect(record.outcome).toBe('stopped');
		expect(record.stages[0]?.status).toBe('error');
		expect(record.stages[0]?.finding).toContain('$.signedIn: expected boolean');
	});

	it('rejects a stage input that fails its schema before running the executor', async () => {
		const strict: StageSpec = { ...signInStage, input: { type: 'object', required: ['caseId'] } };
		const { record, traces } = await run(workflow([strict]));
		expect(traces).toHaveLength(0);
		expect(record.stages[0]).toMatchObject({
			status: 'error',
			finding: 'input rejected: $.caseId: required'
		});
		expect(record.events.map((event) => event.type)).toEqual(['stage.started', 'stage.completed']);
	});
});

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
const RULES: WorkflowSpec['rules'] = {
	greet: () => ({
		output: { greeted: true },
		call: { name: 'say', arguments: { text: 'Hello, who are you here to see?' } }
	}),
	sign: () => ({
		output: { signedIn: true },
		call: { name: 'sign-in', arguments: { visitor: 'A. Person' } }
	})
};

describe('a rule stage', () => {
	it('performs the action and writes the action.performed a session writes', async () => {
		const spec = workflow([greet, { ...signByRule, next: () => 'end' }], { rules: RULES });
		spec.first = 'greet';
		const { record } = await run(spec);
		expect(record.outcome).toBe('completed');
		expect(record.stages.map((stage) => stage.status)).toEqual(['ok', 'ok']);
		const fixture = JSON.parse(readFileSync(FIXTURE, 'utf8')) as EngineEvent[];
		const golden = fixture.find(
			(event) => event.type === 'action.performed' && event.payload.name === 'sign-in'
		);
		const ours = record.events.find(
			(event) => event.type === 'action.performed' && event.payload.name === 'sign-in'
		);
		expect(ours?.payload).toEqual(golden?.payload);
		expect(record.events.map((event) => event.type)).toEqual([
			'stage.started',
			'action.performed',
			'stage.completed',
			'stage.started',
			'action.performed',
			'stage.completed'
		]);
		// The second stage's input is the first's output.
		expect(record.stages[1]?.input.value).toEqual({ greeted: true });
	});

	it('is an error when the world refuses the call, or the rule is missing', async () => {
		const refused = workflow([{ ...signByRule, executor: { kind: 'rule', rule: 'sign' } }], {
			rules: {
				sign: () => ({ output: {}, call: { name: 'look-up', arguments: { record: 'nobody' } } })
			}
		});
		const { record } = await run(refused);
		expect(record.stages[0]).toMatchObject({
			status: 'error',
			finding: 'the world refused look-up: No record "nobody".'
		});
		const missing = await run(workflow([greet]));
		expect(missing.record.stages[0]).toMatchObject({ status: 'error', finding: 'no rule "greet"' });
	});
});

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
	next: () => 'end'
};

describe('a human stage', () => {
	it('resolves by the scripted resolver and records who answered', async () => {
		const by = { kind: 'person' as const, id: 'reviewer-1', name: 'R. Viewer' };
		const { record } = await run(workflow([decide]), {
			human: () => ({ decision: 'refer', by })
		});
		expect(record.stages[0]).toMatchObject({
			status: 'escalated',
			output: { value: { decision: 'refer' } },
			approval: { requested: true, by, decision: 'refer' }
		});
		expect(record.events.map((event) => event.type)).toEqual([
			'stage.started',
			'approval.requested',
			'approval.resolved',
			'stage.completed'
		]);
		const resolved = record.events.find((event) => event.type === 'approval.resolved');
		expect(resolved?.payload).toEqual({ approved: false, by });
	});

	it('takes the default, then the first option, when nobody is there', async () => {
		const { record } = await run(workflow([decide]));
		expect(record.stages[0]).toMatchObject({
			status: 'ok',
			output: { value: { decision: 'approve' } }
		});
		expect(record.stages[0]?.approval).toEqual({ requested: true, decision: 'approve' });
		const defaulted = await run(
			workflow([
				{ ...decide, executor: { ...decide.executor, default: 'refer' } as StageSpec['executor'] }
			])
		);
		expect(defaulted.record.stages[0]?.status).toBe('escalated');
	});

	it('is an error when the answer is not one of the options', async () => {
		const { record } = await run(workflow([decide]), { human: () => ({ decision: 'maybe' }) });
		expect(record.stages[0]).toMatchObject({
			status: 'error',
			finding: '"maybe" is not one of the stage\'s options'
		});
	});
});

describe('a line stage', () => {
	const ping: StageSpec = {
		id: 'ping',
		name: 'Ping the line',
		input: ANY,
		output: { type: 'object', required: ['echoed'] },
		executor: {
			kind: 'line',
			lineId: 'test/echo',
			operation: 'ping',
			arguments: (input) => ({ who: (input as { visitor: string }).visitor })
		},
		next: () => 'end'
	};

	it("calls the line's tool and records tool.executed", async () => {
		const { record } = await run(workflow([ping]));
		expect(record.stages[0]).toMatchObject({
			status: 'ok',
			executor: { kind: 'line', lineId: 'test/echo', operation: 'ping' },
			output: { value: { echoed: { who: 'A. Person' } } }
		});
		const executed = record.events.find((event) => event.type === 'tool.executed');
		expect(executed?.payload).toMatchObject({ name: 'test/connector_echo_ping', result: 'pong' });
	});

	it('is an error for an unknown operation or line', async () => {
		const bad = await run(
			workflow([{ ...ping, executor: { kind: 'line', lineId: 'test/echo', operation: 'pong' } }])
		);
		expect(bad.record.stages[0]).toMatchObject({
			status: 'error',
			finding: 'no tool for test/echo pong'
		});
		const none = await run(
			workflow([{ ...ping, executor: { kind: 'line', lineId: 'test/none', operation: 'ping' } }])
		);
		expect(none.record.stages[0]?.status).toBe('error');
	});
});

describe('configuration', () => {
	it('swaps an executor and records the config as data', async () => {
		const spec = workflow([greet, signByRule], { rules: RULES });
		const { record } = await run(spec, {
			config: {
				executors: { sign: { kind: 'human', prompt: 'Sign?', options: ['yes'] } },
				knobs: { limit: 3 },
				autonomy: { level: 2, ceilings: { sign: 3 } },
				context: contextSpecFor('minimal')
			}
		});
		expect(record.stages[1]?.executor).toEqual({
			kind: 'human',
			prompt: 'Sign?',
			options: ['yes']
		});
		expect(record.stages[1]?.status).toBe('error');
		expect(record.stages[1]?.finding).toContain('output rejected');
		expect(record.config).toEqual({
			executors: { sign: { kind: 'human', prompt: 'Sign?', options: ['yes'] } },
			knobs: { limit: 3 },
			autonomy: { level: 2, ceilings: { sign: 3 } },
			context: contextSpecFor('minimal')
		});
	});

	it('fromStage reproduces the earlier stages byte-identically and diverges after', async () => {
		const spec = workflow([greet, { ...signByRule, next: () => 'decide' }, decide], {
			rules: RULES
		});
		const origin = (await run(spec, { human: () => ({ decision: 'approve' }) })).record;
		const again = (
			await run(spec, {
				fromStage: { stageId: 'decide', from: origin },
				config: {
					executors: { decide: { kind: 'human', prompt: 'Again?', options: ['refer', 'approve'] } }
				},
				human: () => ({ decision: 'approve' })
			})
		).record;
		expect(JSON.stringify(again.stages.slice(0, 2))).toBe(
			JSON.stringify(origin.stages.slice(0, 2))
		);
		expect(origin.stages[2]?.status).toBe('ok');
		expect(again.stages[2]?.status).toBe('escalated');
		expect(again.stages[2]?.executor).toEqual({
			kind: 'human',
			prompt: 'Again?',
			options: ['refer', 'approve']
		});
		expect(again.digest).not.toBe(origin.digest);
	});

	it('the origin config governs the stages before the fork point', async () => {
		const spec = workflow([greet, signByRule], { rules: RULES });
		const origin = (
			await run(spec, {
				config: { executors: { greet: { kind: 'rule', rule: 'sign' } }, knobs: { k: 1 } }
			})
		).record;
		const again = (await run(spec, { fromStage: { stageId: 'sign', from: origin }, config: {} }))
			.record;
		expect(again.stages[0]?.executor).toEqual({ kind: 'rule', rule: 'sign' });
		expect(again.config).toEqual({});
	});
});

describe('the journey', () => {
	it('bounds a cycle and refuses an unknown stage', async () => {
		const loop = workflow([{ ...greet, next: () => 'greet' }], { rules: RULES });
		const { record } = await run(loop, { maxStages: 3 });
		expect(record.outcome).toBe('stopped');
		expect(record.stages).toHaveLength(3);
		await expect(
			run(workflow([{ ...greet, next: () => 'nowhere' }], { rules: RULES }))
		).rejects.toThrow('no stage "nowhere"');
		await expect(run(workflow([greet], { worldId: 'test/none' }))).rejects.toThrow('not installed');
	});

	it('calls onStage with each record and stamps the population digest', async () => {
		const seen: string[] = [];
		const { record } = await run(workflow([greet, signByRule], { rules: RULES }), {
			onStage: (stage) => seen.push(stage.stageId),
			populationDigest: 'abc'
		});
		expect(seen).toEqual(['greet', 'sign']);
		expect(record.populationDigest).toBe('abc');
	});
});

describe('the helpers', () => {
	it('keeps a small value and only the digest of a large one', () => {
		expect(stageValue({ a: 1 })).toEqual({ digest: sha256Hex('{"a":1}'), value: { a: 1 } });
		const big = { text: 'x'.repeat(VALUE_CAP) };
		expect(stageValue(big)).toEqual({ digest: sha256Hex(canonicalJson(big)) });
	});

	it('synthesises one card per agent stage', () => {
		const pack = stagePack(workflow([signInStage, greet]), 'one-visitor');
		expect(pack.id).toBe('workflow/test/visit');
		expect(pack.goalCards?.map((card) => [card.id, card.successCondition])).toEqual([
			['test/visit/stage/sign-in', 'signed-in']
		]);
	});

	it('records an empty config as empty', () => {
		expect(configRecord({})).toEqual({});
		expect(
			configRecord({
				executors: { a: { kind: 'line', lineId: 'l', operation: 'o', arguments: () => 1 } }
			})
		).toEqual({
			executors: { a: { kind: 'line', lineId: 'l', operation: 'o' } }
		});
	});
});

describe('what WP80 added', () => {
	it('a human stage answers with the stage’s suggestion when nobody is there, and the host sees it', async () => {
		const suggested: StageSpec = {
			...decide,
			suggest: () => 'refer'
		};
		const { record } = await run(workflow([suggested]));
		expect(record.stages[0]).toMatchObject({
			status: 'escalated',
			output: { value: { decision: 'refer' } }
		});
		const seen: Array<string | undefined> = [];
		await run(workflow([suggested]), {
			human: (_stage, _state, _executor, suggestion) => {
				seen.push(suggestion);
				return { decision: 'approve' };
			}
		});
		expect(seen).toEqual(['refer']);
	});

	it('hands the world back when the journey is done', async () => {
		let queue = 0;
		let stages = 0;
		await run(workflow([{ ...greet, next: () => 'end' }], { rules: RULES }), {
			onFinished: (world, record) => {
				queue = (world.snapshot() as DeskWorldState).queue.length;
				stages = record.stages.length;
			}
		});
		expect(stages).toBe(1);
		expect(queue).toBe(1);
	});
});
