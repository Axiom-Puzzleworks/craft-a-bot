import { describe, expect, it } from 'vitest';
import { checkCartridge } from './checks/cartridge.js';
import type { Evaluator, GuardrailService } from '@craftabot/core';
import { checkEvaluator } from './checks/evaluator.js';
import { checkGuardrail } from './checks/guardrail.js';
import { checkGuardrailService, hostMatches } from './checks/guardrail-service.js';
import { checkManifest } from './checks/manifest.js';
import { checkTool } from './checks/tool.js';
import { checkWorld } from './checks/world.js';
import { describeConformance } from './describe-conformance.js';
import {
	alwaysAllowGuardrail,
	echoTool,
	exampleEvaluationInput,
	exampleEvaluator,
	exampleTruthEvaluator,
	exampleFixture,
	exampleGuardService,
	exampleGuardrailContext,
	exampleWorld
} from './fixtures/example-pack.js';
import {
	badVerdictGuardrail,
	brokenGuardrailContext,
	brokenPack,
	blindfoldedEvaluator,
	coinFlipEvaluator,
	fabulistEvaluator,
	peekingEvaluator,
	homelessJudge,
	fussyService,
	leakingService,
	malformedService,
	throwingService,
	brokenWorld,
	collidingCompanionPack,
	dishonestSchemaTool,
	incompleteCartridge,
	mutatingGuardrail,
	nondeterministicTool,
	throwingTool,
	unqualifiedTool
} from './fixtures/broken-pack.js';

/**
 * The DoD's second half: "a deliberately-broken fixture pack fails it
 * usefully" (`18-…` §3, WP21). These call the assertion library directly
 * rather than the Vitest adapter, so this suite stays green while proving
 * every check actually rejects the thing it exists to reject — the adapter
 * (`describeConformance`) is exercised separately, against the compliant
 * fixture, in the second `describe` below.
 */

describe('checkManifest against a broken pack', () => {
	it('flags an id that is not qualified "{packId}/{localId}"', () => {
		const issues = checkManifest({ ...brokenPack, tools: [unqualifiedTool] });
		expect(issues.some((issue) => issue.check === 'manifest.ids-qualified')).toBe(true);
		expect(issues.find((issue) => issue.check === 'manifest.ids-qualified')?.message).toContain(
			unqualifiedTool.id
		);
	});

	it('flags an id collision with a companion pack', () => {
		const issues = checkManifest(brokenPack, { companionPacks: [collidingCompanionPack] });
		expect(issues.some((issue) => issue.check === 'manifest.collision-free')).toBe(true);
		expect(issues.find((issue) => issue.check === 'manifest.collision-free')?.message).toContain(
			throwingTool.id
		);
	});

	it('passes a well-formed, self-consistent manifest', () => {
		expect(checkManifest(exampleFixture.manifest)).toEqual([]);
	});
});

describe('checkWorld against a broken world', () => {
	const fixture = {
		worldId: brokenWorld.id,
		scripts: {
			// "never-true" is never reached, so the reachability check should flag it.
			counting: { layoutId: 'only', calls: [{ name: 'nondeterministic', arguments: {} }] }
		},
		illegalActions: [
			{ layoutId: 'only', call: { name: 'throws', arguments: {} } },
			{ layoutId: 'only', call: { name: 'mutates-on-failure', arguments: {} } }
		]
	};

	it('reports the illegal action that throws', () => {
		const issues = checkWorld(brokenWorld, fixture);
		expect(issues.some((issue) => issue.check === 'world.illegal-action-no-throw')).toBe(true);
	});

	it('reports the illegal action that mutates state despite failing', () => {
		const issues = checkWorld(brokenWorld, fixture);
		expect(issues.some((issue) => issue.check === 'world.illegal-action-no-mutation')).toBe(true);
	});

	it('reports the illegal action with no narration', () => {
		const issues = checkWorld(brokenWorld, fixture);
		expect(issues.some((issue) => issue.check === 'world.illegal-action-narration')).toBe(true);
	});

	it('reports the script that does not replay deterministically', () => {
		const issues = checkWorld(brokenWorld, fixture);
		expect(issues.some((issue) => issue.check === 'world.determinism')).toBe(true);
	});

	it('reports the predicate that is never reachable', () => {
		const issues = checkWorld(brokenWorld, fixture);
		expect(issues.some((issue) => issue.check === 'world.predicate-reachable')).toBe(true);
		expect(issues.find((issue) => issue.check === 'world.predicate-reachable')?.message).toContain(
			'never-true'
		);
	});

	it('passes a well-formed, deterministic world', () => {
		const issues = checkWorld(exampleWorld, exampleFixture.world!);
		expect(issues).toEqual([]);
	});
});

describe('checkTool against broken tools', () => {
	it('reports a tool that throws instead of returning a result', async () => {
		const issues = await checkTool(throwingTool, {});
		expect(issues.some((issue) => issue.check === 'tool.executes-offline')).toBe(true);
	});

	it('reports a schema that its own example args do not satisfy', async () => {
		const issues = await checkTool(dishonestSchemaTool, {});
		expect(issues.some((issue) => issue.check === 'tool.schema-honest')).toBe(true);
	});

	it('reports empty output', async () => {
		const issues = await checkTool(dishonestSchemaTool, { requiredField: 'x' });
		expect(issues.some((issue) => issue.check === 'tool.output-non-empty')).toBe(true);
	});

	it('reports non-determinism under identically-seeded randomness', async () => {
		const issues = await checkTool(nondeterministicTool, {});
		expect(issues.some((issue) => issue.check === 'tool.deterministic')).toBe(true);
	});

	it('passes a well-formed, deterministic tool', async () => {
		const issues = await checkTool(echoTool, { text: 'hello' });
		expect(issues).toEqual([]);
	});
});

describe('checkGuardrail against broken guardrails', () => {
	it('reports a verdict outside the closed union', async () => {
		const issues = await checkGuardrail(badVerdictGuardrail, brokenGuardrailContext());
		expect(issues.some((issue) => issue.check === 'guardrail.verdict-shape')).toBe(true);
	});

	it('reports a missing description', async () => {
		const issues = await checkGuardrail(badVerdictGuardrail, brokenGuardrailContext());
		expect(issues.some((issue) => issue.check === 'guardrail.description-present')).toBe(true);
	});

	it('reports a guardrail that mutates its context', async () => {
		const issues = await checkGuardrail(mutatingGuardrail, brokenGuardrailContext());
		expect(issues.some((issue) => issue.check === 'guardrail.pure')).toBe(true);
	});

	it('passes a well-formed, pure guardrail', async () => {
		const issues = await checkGuardrail(alwaysAllowGuardrail, exampleGuardrailContext());
		expect(issues).toEqual([]);
	});
});

describe('checkGuardrailService against broken services (29-… §4.7)', () => {
	const fixture = {
		config: {},
		requests: [{ hook: 'pre-act' as const, text: 'hi', envelope: { agentId: 'a', tick: 1 } }],
		plantedSecret: 'planted-secret-xyz'
	};
	const checks = async (service: GuardrailService, config: unknown = {}) => [
		...new Set((await checkGuardrailService(service, { ...fixture, config })).map((i) => i.check))
	];

	it('reports a malformed service and stops there', async () => {
		expect(await checks(malformedService)).toEqual(['guardrailService.well-formed']);
	});

	it('reports a service that throws offline or live', async () => {
		expect(await checks(throwingService)).toEqual([
			'guardrailService.offline-answers',
			'guardrailService.create-never-throws'
		]);
	});

	it('reports a leaked credential, a repeated label and an undeclared host', async () => {
		expect(await checks(leakingService)).toEqual([
			'guardrailService.offline-answers',
			'guardrailService.no-secret-leaks',
			'guardrailService.egress-declared'
		]);
	});

	it('reports a config the service refuses, and an error of unknown kind', async () => {
		expect(await checks(fussyService)).toEqual(['guardrailService.config-parses']);
		expect(await checks(fussyService, { mustHave: 'x' })).toEqual([
			'guardrailService.offline-answers'
		]);
	});

	it('passes the example service', async () => {
		const serviceFixture = exampleFixture.guardrailServices![exampleGuardService.id]!;
		expect(await checkGuardrailService(exampleGuardService, serviceFixture)).toEqual([]);
	});

	it('matches egress host patterns exactly or with one wildcard label', () => {
		expect(hostMatches('guard.example.test', 'guard.example.test')).toBe(true);
		expect(
			hostMatches('modelarmor.*.rep.googleapis.com', 'modelarmor.europe-west2.rep.googleapis.com')
		).toBe(true);
		expect(hostMatches('modelarmor.*.rep.googleapis.com', 'modelarmor.rep.googleapis.com')).toBe(
			false
		);
		expect(hostMatches('guard.example.test', 'evil.example.test')).toBe(false);
	});
});

describe('checkEvaluator against broken evaluators (31-… §4.4)', () => {
	const fixture = { inputs: [exampleEvaluationInput()], plantedSecret: 'planted-secret-xyz' };
	const checks = async (evaluator: Evaluator) => [
		...new Set((await checkEvaluator(evaluator, fixture)).map((issue) => issue.check))
	];

	it('reports a deterministic evaluator that is not', async () => {
		expect(await checks(coinFlipEvaluator)).toEqual(['evaluator.deterministic']);
	});

	it('reports made-up evidence and a leaked credential', async () => {
		expect(await checks(fabulistEvaluator)).toEqual([
			'evaluator.evidence-real',
			'evaluator.no-secret-leaks'
		]);
	});

	it('reports a model evaluator with no offline form', async () => {
		expect(await checks(homelessJudge)).toEqual(['evaluator.offline-present']);
	});

	it('passes the example evaluator', async () => {
		expect(await checkEvaluator(exampleEvaluator, fixture)).toEqual([]);
	});

	// WP54 (`45-…` §4.1): truth reaches a declared reader and nobody else.
	const truthful = {
		inputs: [{ ...exampleEvaluationInput(), truth: { shouldAct: true } }],
		plantedSecret: 'planted-secret-xyz'
	};

	it('passes a declared truth reader whose verdict depends on truth', async () => {
		expect(await checkEvaluator(exampleTruthEvaluator, truthful)).toEqual([]);
	});

	it('reports a declared reader whose fixture carries no truth, and one that ignores it', async () => {
		expect(await checks(exampleTruthEvaluator)).toEqual(['evaluator.reads-truth']);
		expect([
			...new Set((await checkEvaluator(blindfoldedEvaluator, truthful)).map((i) => i.check))
		]).toEqual(['evaluator.reads-truth']);
	});

	it('reports an undeclared reader that lets a planted truth into its result', async () => {
		expect(await checks(peekingEvaluator)).toEqual(['evaluator.truth-hidden']);
		// The honest example never sees the sentinel, with or without truth on the input.
		expect(await checkEvaluator(exampleEvaluator, truthful)).toEqual([]);
	});
});

describe('checkCartridge against an incomplete entry', () => {
	it('reports the missing fields', () => {
		const issues = checkCartridge(incompleteCartridge);
		expect(issues).toHaveLength(1);
		expect(issues[0]?.check).toBe('cartridge.entry-complete');
	});

	it('passes a complete catalogue entry', () => {
		expect(checkCartridge(exampleFixture.manifest.cartridges![0]!)).toEqual([]);
	});
});

describe('describeConformance against a fully compliant fixture', () => {
	// Exercising the Vitest adapter itself: every it() this registers must pass,
	// which only happens if every check above genuinely returns no issues for a
	// pack that deserves to pass. Registered at module scope, as the adapter's
	// own contract requires (it calls `describe` internally).
	describeConformance(exampleFixture);
});
