import { describe, expect, it } from 'vitest';
import { stubService } from './types/guardrail-service.test.js';
import { z } from 'zod';
import { validateSpec } from './validate-spec.js';
import { createPackRegistry, type PackRegistry } from './pack-registry.js';
import type { AgentSpec } from './schemas/agent-spec.js';
import { migrateAgentSpec, type AgentSpecV2 } from './schemas/agent-spec-v2.js';
import type { PackManifest } from './schemas/pack-manifest.js';
import { v1BrickKinds } from './testing/brick-kinds.js';
import type { BrickKindDefinition } from './types/brick.js';
import type { WorldDefinition } from './types/world.js';

/** A v1 fixture in the shape everything reads it as, so a v2-only case can add to it. */
function migrated(spec: AgentSpec): AgentSpecV2 {
	const result = migrateAgentSpec(spec);
	if ('kind' in result) throw new Error(result.message);
	return result;
}

const playroom: WorldDefinition = {
	id: 'starter/playroom',
	name: 'The Playroom',
	layouts: [{ id: 'default', name: 'Default', initialState: {} }],
	actions: [
		{ id: 'move', name: 'Move', description: 'Move one step.', parameters: {} },
		{ id: 'say', name: 'Say', description: 'Speak.', parameters: {} }
	],
	senses: [{ id: 'sight', name: 'Sight', description: 'See adjacent cells.' }],
	predicates: { 'said-hello': 'said hello near teddy' },
	create: () => {
		throw new Error('not implemented — WP2');
	}
};

function buildRegistry(): PackRegistry {
	const registry = createPackRegistry();
	const starter: PackManifest = {
		id: 'starter',
		name: 'Starter',
		version: '1.0.0',
		requiresCore: '>=1.0.0',
		tools: [
			{
				id: 'starter/calculator',
				name: 'Calculator',
				description: 'Maths.',
				parameters: {},
				execute: () => ({ ok: true, output: '4' })
			},
			{
				id: 'starter/notebook_write',
				name: 'Notebook Write',
				description: 'Write to the scratchpad.',
				parameters: {},
				requiresNotebook: true,
				execute: () => ({ ok: true, output: 'written' })
			}
		],
		goalCards: [
			{
				id: 'starter/say-hello',
				title: 'Say Hello!',
				goalText: 'Introduce yourself to Teddy.',
				worldId: 'starter/playroom',
				layoutId: 'default',
				successCondition: 'said-hello',
				hints: [],
				teachesConcepts: ['loop']
			}
		],
		worlds: [playroom],
		/*
		 * The six V1 kinds, so the generic half of `validateSpec` has something to
		 * recognise. A registry with no kinds registered now blocks every bot with
		 * `unknown-brick-kind`, which is exactly right — a brick that is not
		 * installed genuinely cannot be assembled — and means a stub registry has
		 * to stub this too.
		 */
		brickKinds: v1BrickKinds(),
		policyCards: [
			{
				id: 'starter/policy/no-loose-ends',
				title: 'No loose ends',
				schemaVersion: 1,
				rules: [
					{
						hook: 'pre-act',
						when: { kind: 'call-name-is', value: 'put_down' },
						then: 'block-action',
						reason: 'Nothing gets left on the floor.'
					}
				]
			}
		]
	};
	const openai: PackManifest = {
		id: 'openai',
		name: 'OpenAI',
		version: '1.0.0',
		requiresCore: '>=1.0.0',
		cartridges: [
			{
				id: 'openai/quick-thinker',
				providerId: 'openai',
				model: 'gpt-5-mini',
				displayName: 'Quick Thinker',
				blurb: 'Fast.',
				stats: { words: 2, reasoning: 2, speed: 3 },
				costHint: 'low',
				defaults: { temperature: 0.7, maxTokens: 300 }
			}
		]
	};
	registry.registerPack(starter);
	registry.registerPack(openai);
	return registry;
}

function validSpec(overrides: Partial<AgentSpec> = {}): AgentSpec {
	return {
		id: '11111111-1111-4111-8111-111111111111',
		name: 'Test Bot',
		bricks: {
			llm: {
				cartridgeId: 'openai/quick-thinker',
				temperature: 0.7,
				maxTokens: 300,
				personality: 'Cheerful.'
			},
			memory: { windowSize: 10, notebook: true },
			tools: { enabled: ['starter/calculator'] },
			sense: { channels: ['sight'] },
			actions: { enabled: ['move'] },
			safety: { maxTicks: 30, blockedActions: ['say'], approvalMode: false }
		},
		goalCardId: 'starter/say-hello',
		createdAt: '2026-08-12T09:00:00Z',
		updatedAt: '2026-08-12T09:30:00Z',
		schemaVersion: 1,
		...overrides
	};
}

describe('validateSpec', () => {
	it('returns no problems for a fully valid spec', () => {
		expect(validateSpec(validSpec(), buildRegistry())).toEqual([]);
	});

	it('accepts a bare-minimum bot — a brain and a card, no other bricks fitted', () => {
		const spec = validSpec({
			bricks: {
				llm: {
					cartridgeId: 'openai/quick-thinker',
					temperature: 0.7,
					maxTokens: 300,
					personality: ''
				}
			}
		});
		expect(validateSpec(spec, buildRegistry())).toEqual([]);
	});

	it('reports missing-brain (blocking) when there is no LLM brick', () => {
		const spec = validSpec();
		delete spec.bricks.llm;
		const problems = validateSpec(spec, buildRegistry());
		expect(problems).toContainEqual(
			expect.objectContaining({ code: 'missing-brain', severity: 'blocking' })
		);
	});

	it('reports unknown-cartridge (blocking) for an unresolvable cartridge id', () => {
		const spec = validSpec({
			bricks: {
				...validSpec().bricks,
				llm: { cartridgeId: 'bogus', temperature: 0.7, maxTokens: 300, personality: '' }
			}
		});
		const problems = validateSpec(spec, buildRegistry());
		expect(problems).toContainEqual(
			expect.objectContaining({ code: 'unknown-cartridge', severity: 'blocking' })
		);
	});

	it('reports unknown-goal-card (blocking) for an unresolvable goal card id', () => {
		const spec = validSpec({ goalCardId: 'bogus' });
		const problems = validateSpec(spec, buildRegistry());
		expect(problems).toContainEqual(
			expect.objectContaining({ code: 'unknown-goal-card', severity: 'blocking' })
		);
	});

	it('reports unknown-tool (warning) for an unresolvable tool id', () => {
		const spec = validSpec();
		spec.bricks.tools = { enabled: ['bogus-tool'] };
		const problems = validateSpec(spec, buildRegistry());
		expect(problems).toContainEqual(
			expect.objectContaining({ code: 'unknown-tool', severity: 'warning' })
		);
	});

	it('reports tool-needs-notebook (warning) when a notebook tool is on but the notebook is off', () => {
		const spec = validSpec();
		spec.bricks.tools = { enabled: ['starter/notebook_write'] };
		spec.bricks.memory = { windowSize: 10, notebook: false };
		const problems = validateSpec(spec, buildRegistry());
		expect(problems).toContainEqual(
			expect.objectContaining({ code: 'tool-needs-notebook', severity: 'warning' })
		);
	});

	it('reports tool-needs-notebook (warning) when the Memory brick is entirely absent', () => {
		const spec = validSpec();
		spec.bricks.tools = { enabled: ['starter/notebook_write'] };
		delete spec.bricks.memory;
		const problems = validateSpec(spec, buildRegistry());
		expect(problems).toContainEqual(
			expect.objectContaining({ code: 'tool-needs-notebook', severity: 'warning' })
		);
	});

	it('reports unknown-sense-channel (warning) for an unresolvable sense channel', () => {
		const spec = validSpec();
		spec.bricks.sense = { channels: ['bogus-channel'] };
		const problems = validateSpec(spec, buildRegistry());
		expect(problems).toContainEqual(
			expect.objectContaining({ code: 'unknown-sense-channel', severity: 'warning' })
		);
	});

	it('reports unknown-action (warning) for an unresolvable enabled action', () => {
		const spec = validSpec();
		spec.bricks.actions = { enabled: ['bogus-action'] };
		const problems = validateSpec(spec, buildRegistry());
		expect(problems).toContainEqual(
			expect.objectContaining({ code: 'unknown-action', severity: 'warning' })
		);
	});

	/**
	 * The fourth question, delegated (WP14 slice 3d).
	 *
	 * Core used to check the Safety Brick's blocklist itself, which it could only
	 * do because v1 baked that brick into its schema. It cannot be generic — a
	 * blocklist is not something a brick *offers*, it is a set of ids the brick
	 * refers to, and only the brick knows they are action ids. So the kind is
	 * asked, and what core owns is asking, and saying *where* the answer applies.
	 *
	 * The blocklist itself is proved against the real brick in `pack-starter`;
	 * the kind here is invented, as everything in core's suite is.
	 */
	it('asks a kind about its own config, and says which socket the answer is about', () => {
		const registry = buildRegistry();
		registry.registerPack({
			id: 'expansion',
			name: 'Expansion',
			version: '1.0.0',
			requiresCore: '>=1.0.0',
			brickKinds: [
				{
					id: 'expansion/warden',
					slot: 'safety',
					name: 'Warden',
					description: 'Refuses things',
					realName: 'Warden',
					realExplanation: 'Refuses things',
					configSchema: z.object({ forbid: z.array(z.string()) }),
					configVersion: 1,
					defaults: { forbid: [] },
					validateConfig: (config: { forbid: string[] }, ctx) =>
						config.forbid
							.filter((id) => !ctx.hasAction(id))
							.map((id) => ({
								code: 'unknown-blocked-action' as const,
								severity: 'warning' as const,
								message: `The blocklist names "${id}", which isn't an installed action.`,
								details: { actionId: id }
							}))
				} as BrickKindDefinition
			]
		});

		const spec = migrated(validSpec());
		spec.bricks.push({
			slot: 'safety',
			kind: 'expansion/warden',
			configVersion: 1,
			config: { forbid: ['bogus-action'] }
		});

		expect(validateSpec(spec, registry)).toContainEqual(
			expect.objectContaining({
				code: 'unknown-blocked-action',
				severity: 'warning',
				slot: 'safety'
			})
		);
	});

	/**
	 * The whole validation context, exercised. It is four questions rather than
	 * the registry itself so that a brick can check what it *names* without being
	 * able to enumerate what is installed — worth pinning, because "the brick got
	 * handed the registry" is the easy version somebody will otherwise reach for.
	 */
	it('lets a kind ask about all four kinds of installed content', () => {
		const registry = buildRegistry();
		const asked: string[] = [];
		registry.registerPack({
			id: 'expansion',
			name: 'Expansion',
			version: '1.0.0',
			requiresCore: '>=1.0.0',
			brickKinds: [
				{
					id: 'expansion/curious',
					slot: 'perception',
					name: 'Curious',
					description: 'Asks about everything',
					realName: 'Curious',
					realExplanation: 'Asks about everything',
					configSchema: z.object({}),
					configVersion: 1,
					defaults: {},
					validateConfig: (_config: unknown, ctx) => {
						if (ctx.hasTool('starter/calculator')) asked.push('tool');
						if (ctx.hasAction('move')) asked.push('action');
						if (ctx.hasSenseChannel('sight')) asked.push('sense');
						if (ctx.hasCartridge('openai/quick-thinker')) asked.push('cartridge');
						if (ctx.hasPolicyCard('starter/policy/no-loose-ends')) asked.push('policyCard');
						// Nothing wrong; the point is that it was able to look.
						return [];
					}
				} as BrickKindDefinition
			]
		});

		const spec = migrated(validSpec({ bricks: { ...validSpec().bricks, sense: undefined } }));
		spec.bricks.push({
			slot: 'perception',
			kind: 'expansion/curious',
			configVersion: 1,
			config: {}
		});

		expect(validateSpec(spec, registry)).toEqual([]);
		expect(asked).toEqual(['tool', 'action', 'sense', 'cartridge', 'policyCard']);
	});

	/**
	 * The credential seam (`25-…` §4.6, WP35 stage C) — `hasCredential` is the
	 * build-check counterpart to `createSession`'s own `getCredential`: a kind
	 * can ask whether the host's vault holds a secret under its own
	 * credential id, without the config schema ever seeing the value.
	 */
	/** WP39 stage B (`29-…` §4.3): both contexts resolve a registered guardrail service. */
	describe('guardrail services', () => {
		it('a brick can ask for a registered service while validating and while being built', () => {
			const registry = buildRegistry();
			const service = stubService({ id: 'expansion9/stub' });
			const seen: string[] = [];
			registry.registerPack({
				id: 'expansion9',
				name: 'Expansion 9',
				version: '1.0.0',
				requiresCore: '>=1.0.0',
				guardrailServices: [service],
				assertionCards: [
					{
						id: 'expansion9/card',
						title: 'A card',
						schemaVersion: 1,
						quantifier: 'never',
						when: { kind: 'call-name-is', value: 'move' }
					}
				],
				brickKinds: [
					{
						id: 'expansion9/guarded',
						slot: 'perception',
						name: 'Guarded',
						description: 'Names a service.',
						realName: 'Guarded',
						realExplanation: 'Names a service.',
						configSchema: z.object({}),
						configVersion: 1,
						defaults: {},
						validateConfig: (_config: unknown, ctx) => {
							seen.push(`validate:${ctx.hasGuardrailService('expansion9/stub')}`);
							seen.push(`validate-missing:${ctx.hasGuardrailService('expansion9/none')}`);
							// WP43: evaluators and assertion cards answer the same way.
							seen.push(`evaluator:${ctx.hasEvaluator?.('expansion9/card')}`);
							seen.push(`evaluator-missing:${ctx.hasEvaluator?.('expansion9/none')}`);
							return [];
						},
						createRuntime: (_config: unknown, ctx) => {
							seen.push(`runtime:${ctx.getGuardrailService('expansion9/stub')?.id}`);
							seen.push(`runtime-card:${ctx.getAssertionCard?.('expansion9/card')?.id}`);
							seen.push(`runtime-evaluator:${ctx.getEvaluator?.('expansion9/none')?.id}`);
							return {};
						}
					} as BrickKindDefinition
				]
			});
			const spec = migrated(validSpec({ bricks: { ...validSpec().bricks, sense: undefined } }));
			spec.bricks.push({
				slot: 'perception',
				kind: 'expansion9/guarded',
				configVersion: 1,
				config: {}
			});

			validateSpec(spec, registry);
			expect(seen).toEqual([
				'runtime:expansion9/stub',
				'runtime-card:expansion9/card',
				'runtime-evaluator:undefined',
				'validate:true',
				'validate-missing:false',
				'evaluator:true',
				'evaluator-missing:false'
			]);
		});
	});

	/** WP40 (`26-…` §6.13): sockets have a capacity — one everywhere but `safety`, which holds four. */
	describe('socket capacity', () => {
		function withSafetyStack(count: number) {
			const registry = buildRegistry();
			const spec = migrated(validSpec());
			const safety = spec.bricks.find((brick) => brick.slot === 'safety');
			if (!safety) throw new Error('the valid spec has no safety brick');
			for (let i = 1; i < count; i += 1) spec.bricks.push(structuredClone(safety));
			return validateSpec(spec, registry).filter((p) => p.code === 'slot-already-filled');
		}

		it('lets four safety bricks share the socket', () => {
			expect(withSafetyStack(4)).toEqual([]);
		});

		it('refuses a fifth, naming the count and the capacity', () => {
			const problems = withSafetyStack(5);
			expect(problems).toHaveLength(1);
			expect(problems[0]?.message).toBe(
				'There are 5 bricks in the safety socket, and only 4 will fit.'
			);
			expect(problems[0]?.details).toMatchObject({ slot: 'safety', capacity: 4 });
		});

		it('still holds every other socket to one', () => {
			const registry = buildRegistry();
			const spec = migrated(validSpec());
			const memory = spec.bricks.find((brick) => brick.slot === 'memory');
			if (!memory) throw new Error('the valid spec has no memory brick');
			spec.bricks.push(structuredClone(memory));
			const problems = validateSpec(spec, registry).filter((p) => p.code === 'slot-already-filled');
			expect(problems).toHaveLength(1);
			expect(problems[0]?.message).toBe(
				'There are two bricks in the memory socket, and only one will fit.'
			);
		});
	});

	describe('hasCredential', () => {
		function curiousAboutCredential(problem: (has: boolean) => void): BrickKindDefinition {
			return {
				id: 'expansion8/curious',
				slot: 'perception',
				name: 'Curious',
				description: 'Asks whether its own credential is plugged in.',
				realName: 'Curious',
				realExplanation: 'Asks whether its own credential is plugged in.',
				configSchema: z.object({}),
				configVersion: 1,
				defaults: {},
				validateConfig: (_config: unknown, ctx) => {
					problem(ctx.hasCredential('test/cred'));
					return [];
				}
			} as BrickKindDefinition;
		}

		function withCuriousBrick(registry: PackRegistry, kind: BrickKindDefinition) {
			registry.registerPack({
				id: 'expansion8',
				name: 'Expansion 8',
				version: '1.0.0',
				requiresCore: '>=1.0.0',
				brickKinds: [kind]
			});
			const spec = migrated(validSpec({ bricks: { ...validSpec().bricks, sense: undefined } }));
			spec.bricks.push({
				slot: 'perception',
				kind: 'expansion8/curious',
				configVersion: 1,
				config: {}
			});
			return spec;
		}

		it('defaults to false when the caller supplies no hasCredential', () => {
			const registry = buildRegistry();
			let seen: boolean | undefined;
			const spec = withCuriousBrick(
				registry,
				curiousAboutCredential((has) => (seen = has))
			);

			validateSpec(spec, registry);
			expect(seen).toBe(false);
		});

		it("reports what the caller's own hasCredential says", () => {
			const registry = buildRegistry();
			let seen: boolean | undefined;
			const spec = withCuriousBrick(
				registry,
				curiousAboutCredential((has) => (seen = has))
			);

			validateSpec(spec, registry, { hasCredential: (id) => id === 'test/cred' });
			expect(seen).toBe(true);
		});

		/**
		 * Nothing built for validation is ever run (this file's own comment,
		 * above `ownProblems`) — a build-check runtime's `ctx.fetch` is a stub
		 * that rejects rather than the platform `fetch`, so a kind that called
		 * it while the ribbon merely refreshes gets a clear rejection instead
		 * of a real network call nobody asked for.
		 */
		it('gives a build-check runtime a fetch that rejects rather than the real network, and a getCredential that answers undefined', async () => {
			const registry = buildRegistry();
			let seenFetch: typeof globalThis.fetch | undefined;
			let seenCredential: string | undefined = 'not yet called';
			registry.registerPack({
				id: 'expansion9',
				name: 'Expansion 9',
				version: '1.0.0',
				requiresCore: '>=1.0.0',
				brickKinds: [
					{
						id: 'expansion9/watches',
						slot: 'perception',
						name: 'Watches',
						description: 'Notes the fetch and credential a build-check runtime was handed.',
						realName: 'Watches',
						realExplanation: 'Notes the fetch and credential a build-check runtime was handed.',
						configSchema: z.object({}),
						configVersion: 1,
						defaults: {},
						createRuntime: (_config: unknown, ctx) => {
							seenFetch = ctx.fetch;
							seenCredential = ctx.getCredential('test/cred');
							return {};
						}
					} as BrickKindDefinition
				]
			});
			const spec = migrated(validSpec({ bricks: { ...validSpec().bricks, sense: undefined } }));
			spec.bricks.push({
				slot: 'perception',
				kind: 'expansion9/watches',
				configVersion: 1,
				config: {}
			});

			validateSpec(spec, registry);
			await expect(seenFetch?.('https://example.com')).rejects.toThrow();
			expect(seenCredential).toBeUndefined();
		});
	});

	/**
	 * The runtimes `validateSpec` builds to ask `callProblems`/`senseProblems`
	 * what a brick offers (`14-…` §2.1) are handed the same
	 * `BrickRuntimeContext` a live session would use — `getPolicyCard`
	 * included, so a kind that only resolves its policy card inside
	 * `createRuntime` (rather than `validateConfig`) is checked exactly as
	 * thoroughly.
	 */
	it('gives a runtime built for build-checking the same getPolicyCard a live session would', () => {
		const registry = buildRegistry();
		const seen: (string | undefined)[] = [];
		registry.registerPack({
			id: 'expansion2',
			name: 'Expansion 2',
			version: '1.0.0',
			requiresCore: '>=1.0.0',
			brickKinds: [
				{
					id: 'expansion2/watches',
					slot: 'safety',
					name: 'Watches',
					description: 'Looks up its own card.',
					realName: 'Watches',
					realExplanation: 'Looks up its own card.',
					configSchema: z.object({}),
					configVersion: 1,
					defaults: {},
					createRuntime: (_config: unknown, ctx) => {
						seen.push(ctx.getPolicyCard('starter/policy/no-loose-ends')?.title);
						return {};
					}
				} as BrickKindDefinition
			]
		});

		const spec = migrated(validSpec({ bricks: { ...validSpec().bricks, safety: undefined } }));
		spec.bricks.push({ slot: 'safety', kind: 'expansion2/watches', configVersion: 1, config: {} });

		validateSpec(spec, registry);
		expect(seen).toEqual(['No loose ends']);
	});

	/** Same reasoning as above, for `getAction` (WP24). */
	it('gives a runtime built for build-checking the same getAction a live session would', () => {
		const registry = buildRegistry();
		const seen: (string | undefined)[] = [];
		registry.registerPack({
			id: 'expansion3',
			name: 'Expansion 3',
			version: '1.0.0',
			requiresCore: '>=1.0.0',
			brickKinds: [
				{
					id: 'expansion3/watches',
					slot: 'safety',
					name: 'Watches',
					description: 'Looks up an action.',
					realName: 'Watches',
					realExplanation: 'Looks up an action.',
					configSchema: z.object({}),
					configVersion: 1,
					defaults: {},
					createRuntime: (_config: unknown, ctx) => {
						seen.push(ctx.getAction('move')?.name);
						return {};
					}
				} as BrickKindDefinition
			]
		});

		const spec = migrated(validSpec({ bricks: { ...validSpec().bricks, safety: undefined } }));
		spec.bricks.push({ slot: 'safety', kind: 'expansion3/watches', configVersion: 1, config: {} });

		validateSpec(spec, registry);
		expect(seen).toEqual(['Move']);
	});

	it('reports every dangling id at once for a badly broken spec', () => {
		const spec = validSpec({ goalCardId: 'bogus' });
		spec.bricks.tools = { enabled: ['bogus-tool'] };
		spec.bricks.sense = { channels: ['bogus-channel'] };
		spec.bricks.actions = { enabled: ['bogus-action'] };
		delete spec.bricks.llm;
		const problems = validateSpec(spec, buildRegistry());
		const codes = problems.map((p) => p.code).sort();
		expect(codes).toEqual(
			[
				'missing-brain',
				'unknown-action',
				'unknown-goal-card',
				'unknown-sense-channel',
				'unknown-tool'
			].sort()
		);
	});
});
