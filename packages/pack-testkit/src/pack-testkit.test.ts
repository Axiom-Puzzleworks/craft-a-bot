import { describe, expect, it } from 'vitest';
import { checkCartridge } from './checks/cartridge.js';
import { checkGuardrail } from './checks/guardrail.js';
import { checkManifest } from './checks/manifest.js';
import { checkTool } from './checks/tool.js';
import { checkWorld } from './checks/world.js';
import { describeConformance } from './describe-conformance.js';
import {
	alwaysAllowGuardrail,
	echoTool,
	exampleFixture,
	exampleGuardrailContext,
	exampleWorld
} from './fixtures/example-pack.js';
import {
	badVerdictGuardrail,
	brokenGuardrailContext,
	brokenPack,
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
