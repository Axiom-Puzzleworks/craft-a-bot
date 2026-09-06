import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
	createMemoryStorage,
	createPackRegistry,
	type AgentRecord,
	type AgentSpecV2,
	type ControlMap,
	type EngineEvent,
	type EvaluationRecord,
	type PackManifest,
	type RunRecord,
	type RunSummary
} from '@craftabot/core';
import { describe, expect, it } from 'vitest';
import {
	ASSURANCE_POSTURE,
	assurancePackDigest,
	assurancePackFor,
	assurancePackFromStorage,
	canonicalJson,
	type AssuranceCampaignReportLike,
	type AssurancePack
} from './assurance-pack.js';
import {
	ASSURANCE_TOKENS,
	renderAssurancePackHtml,
	renderAssurancePackMarkdown
} from './assurance-pack-render.js';
import { GENERIC_CONTROL_MAP_MANIFEST } from './control-map.js';

/**
 * The assurance pack (WP67, `53-…` §11): a fixture bot with one campaign and
 * one incident is snapshot-tested; a bot with no campaign says so in every
 * section; the digest changes when any constituent does and not with the
 * clock; every number in both renderings cites its runs; the HTML is one
 * file with no script and the app's tokens inlined; the store path folds the
 * same pack as the pure one.
 */
const AGENT_ID = '11111111-1111-4111-8111-111111111111';
const RUN_A = '22222222-2222-4222-8222-222222222221';
const RUN_B = '22222222-2222-4222-8222-222222222222';
const NOW = () => '2026-09-06T12:00:00.000Z';

const card = {
	id: 'test/policy/no-fire',
	title: 'No fire',
	description: 'Blocks fire.',
	schemaVersion: 1 as const,
	rules: [
		{
			hook: 'pre-act' as const,
			when: { kind: 'call-name-is' as const, value: 'fire' },
			then: 'block-action' as const,
			reason: 'x'
		}
	]
};
const judge = {
	id: 'test/judge',
	name: 'Judge',
	description: 'Judges.',
	kind: 'deterministic' as const,
	evaluate: () =>
		Promise.resolve({
			evaluatorId: 'test/judge',
			verdict: 'pass' as const,
			explanation: '',
			evidence: []
		})
};
const map: ControlMap = {
	id: 'test/control-map',
	title: 'Test map',
	description: 'A map.',
	rows: [
		{
			framework: 'FCA Consumer Duty (PRIN 2A)',
			ref: 'support',
			title: 'Support',
			obligation: 'Help under pressure.',
			evidence: [
				{ kind: 'evaluator', id: judge.id },
				{ kind: 'policy-card', id: card.id },
				{ kind: 'gate', id: 'parity' },
				{ kind: 'artefact', id: 'campaign-report' },
				{ kind: 'principal', id: 'run.started.principal' }
			],
			tags: ['fca:cd:support'],
			status: 'unreviewed'
		},
		{
			framework: 'FCA DISP',
			ref: 'complaints',
			title: 'Complaints',
			obligation: 'Answered in time.',
			evidence: [],
			tags: ['fca:disp:complaints'],
			status: 'pending',
			note: 'Waits for WP72.'
		}
	]
};
const manifest: PackManifest = {
	id: 'test',
	name: 'Test',
	version: '1.2.3',
	requiresCore: '>=1.0.0',
	goalCards: [
		{
			id: 'test/card',
			title: 'The card',
			goalText: 'Do the thing.',
			worldId: 'test/world',
			layoutId: 'default',
			successCondition: 'done',
			hints: [],
			teachesConcepts: [],
			par: 1
		}
	],
	policyCards: [card],
	evaluators: [judge],
	controlMaps: [map]
};

const spec: AgentSpecV2 = {
	id: AGENT_ID,
	name: 'Bolt',
	schemaVersion: 2,
	bricks: [
		{
			slot: 'safety',
			kind: 'test/safety',
			configVersion: 1,
			config: { policyCards: [card.id] }
		}
	],
	goalCardId: 'test/card',
	identity: { displayName: 'Bolt', boxArtSeed: 'seed' },
	createdAt: NOW(),
	updatedAt: NOW()
};

const run = (id: string, outcome: string, startedAt: string): RunRecord =>
	({
		id,
		agentId: AGENT_ID,
		agentName: 'Bolt',
		goalCardId: 'test/card',
		outcome,
		startedAt
	}) as never as RunRecord;
const summary = (runId: string, over: Partial<RunSummary> = {}): RunSummary => ({
	runId,
	checks: 3,
	saves: 0,
	guardrailTrips: {},
	approvalsRequested: 0,
	approvalsGranted: 0,
	findings: [],
	decisions: 2,
	hostedPreActScreens: 0,
	egress: { mode: 'none', hosts: [] },
	schemaVersion: 1,
	...over
});
const evaluation = (runId: string, verdict: 'pass' | 'fail'): EvaluationRecord => ({
	id: `e-${runId}-${verdict}`,
	runId,
	evaluatorId: judge.id,
	result: { evaluatorId: judge.id, verdict, explanation: '', evidence: [] },
	evaluatedAt: NOW(),
	schemaVersion: 1
});
const report: AssuranceCampaignReportLike = {
	id: 'r1',
	campaignId: 'c1',
	campaignTitle: 'The baseline',
	createdAt: '2026-09-05T09:00:00.000Z',
	passed: true,
	builds: [{ id: 'bolt', agentId: AGENT_ID, agentName: 'Bolt' }],
	cells: [
		{
			build: 'bolt',
			outcome: 'SUCCESS',
			runId: RUN_A,
			cohort: { proxy: 'proxy-a' },
			evaluations: { [judge.id]: 'pass' }
		},
		{
			build: 'bolt',
			outcome: 'SUCCESS',
			runId: RUN_B,
			cohort: { proxy: 'proxy-b' },
			evaluations: { [judge.id]: 'fail' }
		}
	],
	gates: [
		{ id: 'wins', kind: 'outcome-rate', required: 'SUCCESS ≥ 100%', observed: 1, passed: true },
		{
			id: 'parity:pair',
			kind: 'parity',
			required: 'agree across proxy: spread ≤ 0',
			observed: 0,
			passed: true,
			matched: true,
			values: { 'proxy-a': 1, 'proxy-b': 1 },
			where: { build: 'bolt' }
		}
	],
	summary: {
		matrices: [
			{
				evaluatorId: judge.id,
				slice: {},
				tp: 1,
				fp: 0,
				tn: 1,
				fn: 0,
				precision: 1,
				recall: 1,
				falsePositiveRate: 0
			}
		],
		cohorts: [
			{ attribute: 'proxy', value: 'proxy-a', cells: 1, successRate: 1 },
			{ attribute: 'proxy', value: 'proxy-b', cells: 1, successRate: 1 }
		],
		obligations: [{ tag: 'fca:cd:support', cells: 2, successRate: 1 }]
	}
};

const registryWith = () => {
	const registry = createPackRegistry();
	registry.registerPack(manifest);
	registry.registerPack(GENERIC_CONTROL_MAP_MANIFEST as unknown as PackManifest);
	return registry;
};

const runs = [
	run(RUN_A, 'SUCCESS', '2026-09-04T10:00:00.000Z'),
	run(RUN_B, 'FAILURE', '2026-09-05T10:00:00.000Z')
];
/** RUN_A was started by a person, RUN_B by the harness (WP65): the pack names both, and the validator is whoever's run an evaluator judged. */
const PERSON = { kind: 'person', id: 'browser-1', name: 'Sam' } as const;
const SERVICE = { kind: 'service', id: 'craftabot-harness', name: 'ci' } as const;
const summaries = new Map<string, RunSummary>([
	[RUN_A, summary(RUN_A, { approvalsRequested: 1, approvalsGranted: 1, principal: PERSON })],
	[
		RUN_B,
		summary(RUN_B, {
			findings: [{ kind: 'guardrail-catch', tick: 2, summary: 'No fire blocked fire.' }],
			guardrailTrips: { [card.id]: 1 },
			principal: SERVICE
		})
	]
]);
const evaluations = [evaluation(RUN_A, 'pass'), evaluation(RUN_B, 'fail')];
/** The incident run's own rows at the finding's tick (WP66): what its explanation is folded from. */
let eventSeq = 0;
const row = (type: EngineEvent['type'], payload: unknown, tick: number): EngineEvent =>
	({
		id: `33333333-3333-4333-8333-${String(++eventSeq).padStart(12, '0')}`,
		runId: RUN_B,
		tick,
		timestamp: NOW(),
		type,
		payload
	}) as EngineEvent;
const INCIDENT_EVENTS: EngineEvent[] = [
	row('sense', { channels: ['look'], observation: { channels: ['look'], text: 'A match.' } }, 2),
	row(
		'decision',
		{
			thought: 'Light it.',
			call: { kind: 'action', name: 'fire', arguments: {} },
			source: 'brain'
		},
		2
	),
	row(
		'guardrail.checked',
		{
			guardrailId: 'policy/no-fire',
			hook: 'pre-act',
			verdict: { allow: false, reason: 'No fire.', disposition: 'block-action' },
			policyCardId: card.id
		},
		2
	),
	row('tick.completed', {}, 2)
];
const incidentEvents = new Map<string, readonly EngineEvent[]>([[RUN_B, INCIDENT_EVENTS]]);

const fullPack = () =>
	assurancePackFor({
		agent: { id: AGENT_ID, name: 'Bolt', spec },
		registry: registryWith(),
		runs,
		summaries,
		evaluations,
		campaignReports: [report],
		incidentEvents,
		now: NOW
	});
const emptyPack = () =>
	assurancePackFor({
		agent: { id: AGENT_ID, name: 'Bolt', spec },
		registry: registryWith(),
		runs: [],
		summaries: new Map(),
		evaluations: [],
		campaignReports: [],
		now: NOW
	});

describe('assurancePackFor', () => {
	it('folds a fixture bot with one campaign and one incident — the snapshot', async () => {
		const pack = await fullPack();
		expect(pack.posture).toBe(ASSURANCE_POSTURE);
		expect(pack.review).toEqual({ rows: 2 + 22, reviewed: 0, unreviewed: 23, pending: 1 });
		expect(pack.development.campaigns).toHaveLength(1);
		expect(pack.development.campaigns[0]?.runIds).toEqual([RUN_A, RUN_B]);
		expect(pack.development.campaigns[0]?.parity[0]).toMatchObject({
			matched: true,
			values: { 'proxy-a': 1, 'proxy-b': 1 }
		});
		expect(pack.monitoring.incidents.map((incident) => incident.runId)).toEqual([RUN_B]);
		// The incident's finding at tick 2 carries the decision it explains (WP66), with the fitted card's check.
		expect(pack.monitoring.incidents[0]?.explanations).toHaveLength(1);
		expect(pack.monitoring.incidents[0]?.explanations[0]).toMatchObject({
			tick: 2,
			decision: { call: { name: 'fire' } },
			checks: [{ guardrailId: 'policy/no-fire', verdict: 'block', policyCardId: card.id }],
			callsAvailable: []
		});
		expect(pack.monitoring.explanations).toMatchObject({ recorded: true });
		// The principals (WP65): every distinct one with its runs; the validators are those of the evaluated runs.
		expect(pack.governance.principal).toEqual({
			recorded: true,
			principals: [
				{ principal: PERSON, runIds: [RUN_A] },
				{ principal: SERVICE, runIds: [RUN_B] }
			]
		});
		expect(pack.validation.validatedBy).toMatchObject({
			recorded: true,
			validators: [
				{ principal: PERSON, runIds: [RUN_A] },
				{ principal: SERVICE, runIds: [RUN_B] }
			]
		});
		expect(
			pack.controlMaps
				.flatMap((map) => map.rows)
				.flatMap((row) => row.evidence)
				.filter((item) => item.kind === 'principal')
				.map((item) => item.presence)
		).toEqual(expect.arrayContaining(['present']));
		expect(pack.governance.approvals).toEqual({ requested: 1, granted: 1, runIds: [RUN_A] });
		expect(pack.validation.evaluations[0]).toMatchObject({
			evaluatorId: judge.id,
			pass: 1,
			fail: 1,
			runIds: [RUN_A, RUN_B]
		});
		expect(pack.outcomes.find((outcome) => outcome.tag === 'fca:cd:support')).toMatchObject({
			rows: ['test/control-map/support'],
			evaluations: [expect.objectContaining({ evaluatorId: judge.id })]
		});
		const row = pack.controlMaps.find((entry) => entry.id === map.id)?.rows[0];
		expect(row?.evidence.map((item) => `${item.id}:${item.presence}`)).toEqual([
			`${judge.id}:present`,
			`${card.id}:present`,
			'parity:present',
			'campaign-report:present',
			'run.started.principal:present'
		]);
		expect(pack.inventory.requires).toMatchObject({
			core: expect.stringMatching(/^>=/),
			brickKinds: {}
		});
		expect(pack.governance.principal.recorded).toBe(true);
		expect(pack).toMatchSnapshot();
	});

	it('a bot with no runs and no campaign says so in every section, never a zero that reads as a rate', async () => {
		const pack = await emptyPack();
		expect(pack.development.campaigns).toEqual([]);
		expect(pack.development.note).toContain('no campaign evidence');
		expect(pack.validation.note).toContain('no evaluation evidence');
		expect(pack.monitoring.note).toContain('no stored runs');
		expect(pack.runs).toEqual([]);
		const md = renderAssurancePackMarkdown(pack);
		expect(md).toContain('no campaign evidence');
		expect(md).toContain('No stored runs');
		expect(md).not.toMatch(/\b0%/);
		const row = pack.controlMaps.find((entry) => entry.id === map.id)?.rows[0];
		expect(row?.evidence.map((item) => item.presence)).toEqual([
			'available',
			'present',
			'available',
			'available',
			'not-recorded'
		]);
	});

	it('the digest covers every constituent and not the clock', async () => {
		const a = await fullPack();
		const again = await assurancePackFor({
			agent: { id: AGENT_ID, name: 'Bolt', spec },
			registry: registryWith(),
			runs,
			summaries,
			evaluations,
			campaignReports: [report],
			incidentEvents,
			now: () => '2027-01-01T00:00:00.000Z'
		});
		expect(again.digest).toBe(a.digest);
		expect(again.generatedAt).not.toBe(a.generatedAt);
		const fewerRuns = await assurancePackFor({
			agent: { id: AGENT_ID, name: 'Bolt', spec },
			registry: registryWith(),
			runs: runs.slice(0, 1),
			summaries,
			evaluations,
			campaignReports: [report],
			incidentEvents,
			now: NOW
		});
		expect(fewerRuns.digest).not.toBe(a.digest);
		const noCampaign = await assurancePackFor({
			agent: { id: AGENT_ID, name: 'Bolt', spec },
			registry: registryWith(),
			runs,
			summaries,
			evaluations,
			campaignReports: [],
			incidentEvents,
			now: NOW
		});
		expect(noCampaign.digest).not.toBe(a.digest);
		const { digest: _digest, ...body } = a;
		void _digest;
		expect(await assurancePackDigest(body)).toBe(a.digest);
		expect(canonicalJson({ b: 1, a: [{ d: 2, c: undefined }] })).toBe('{"a":[{"d":2}],"b":1}');
	});

	it('the store path folds the same pack as the pure one', async () => {
		const storage = createMemoryStorage();
		const record: AgentRecord = {
			id: AGENT_ID,
			spec,
			lastValidation: [],
			createdAt: NOW(),
			updatedAt: NOW(),
			schemaVersion: 2
		};
		await storage.putAgent(record);
		for (const entry of runs) await storage.putRun(entry);
		for (const value of summaries.values()) await storage.putRunSummary(value);
		for (const evaluationRecord of evaluations) await storage.putEvaluation(evaluationRecord);
		await storage.appendEvents(RUN_B, INCIDENT_EVENTS);
		await storage.putCampaignReport({
			id: report.id,
			campaignId: 'c1',
			title: report.campaignTitle,
			createdAt: report.createdAt,
			passed: true,
			gatesPassed: 2,
			gatesTotal: 2,
			cells: 2,
			report: report as unknown as Record<string, unknown>,
			schemaVersion: 1
		});
		const fromStore = await assurancePackFromStorage(AGENT_ID, storage, registryWith(), {
			now: NOW
		});
		const pure = await fullPack();
		expect(fromStore).toEqual(pure);
		await expect(assurancePackFromStorage('nope', storage, registryWith())).rejects.toThrow(
			/no bot/
		);
	});
});

describe('the renderings', () => {
	const citing = (line: string) => /\(runs: |\(no runs behind/.test(line);

	it('markdown: every campaign, evaluation and approval figure cites its runs; both postures ride along', async () => {
		const md = renderAssurancePackMarkdown(await fullPack());
		expect(md.startsWith('# Assurance pack — Bolt')).toBe(true);
		expect(md.split(ASSURANCE_POSTURE)).toHaveLength(3);
		const figures = md
			.split('\n')
			// The top-level figures; a gate, matrix or obligation line sits under its campaign's own citation.
			.filter((line) => /^- .*\b(pass|fail|cells|requested)\b/.test(line) && /\d/.test(line));
		expect(figures.length).toBeGreaterThan(3);
		for (const line of figures) expect(citing(line), line).toBe(true);
		expect(md).toContain(`[${RUN_A}]`.slice(1, -1));
		expect(md).toContain('pending — Waits for WP72.');
		// The principal is recorded (WP65): the chain, citing the run it started.
		expect(md).toContain('person "Sam" (browser-1)');
		expect(md).toContain('service "ci" (craftabot-harness)');
		expect(md).not.toContain('not recorded in this build (WP65)');
	});

	it('HTML: one file, no script, the app’s tokens inlined, every run id an anchor into the appendix', async () => {
		const pack = await fullPack();
		const html = renderAssurancePackHtml(pack);
		expect(html.startsWith('<!doctype html>')).toBe(true);
		expect(html).not.toMatch(/<script/i);
		expect(html).not.toMatch(/<link /i);
		expect(html).toContain(`href="#run-${RUN_A}"`);
		expect(html).toContain(`id="run-${RUN_A}"`);
		expect(html).toContain('<caption>Gates</caption>');
		expect(html.split(ASSURANCE_POSTURE)).toHaveLength(3);
		expect(html).toContain('<html lang="en">');
		const cites = html.match(/\(runs: /g) ?? [];
		expect(cites.length).toBeGreaterThanOrEqual(4);
		expect(html).toContain('matched (the campaign’s own claim)');
	});

	it('the inlined tokens are the app’s (tokens.css), value for value', () => {
		const here = dirname(fileURLToPath(import.meta.url));
		const css = readFileSync(
			join(here, '..', '..', '..', '..', 'apps', 'workbench', 'src', 'lib', 'styles', 'tokens.css'),
			'utf8'
		);
		for (const [name, value] of Object.entries(ASSURANCE_TOKENS)) {
			const match = new RegExp(`--cab-${name}:\\s*(#[0-9a-fA-F]{6})`).exec(css);
			expect(match?.[1], name).toBe(value);
		}
	});

	it('the empty pack renders too, with every section present', async () => {
		const pack: AssurancePack = await emptyPack();
		const html = renderAssurancePackHtml(pack);
		for (const heading of [
			'1. Identification',
			'2. Governance',
			'3. Development',
			'4. Independent validation',
			'5. Risk mitigants',
			'6. Ongoing monitoring',
			'7. The Consumer Duty outcomes',
			'8. The control map',
			'Appendix'
		])
			expect(html).toContain(heading);
		expect(html).toContain('No stored runs.');
	});
});
