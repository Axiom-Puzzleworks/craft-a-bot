import { describe, expect, it } from 'vitest';
import {
	createPackRegistry,
	createSession,
	type AgentSpecV2,
	type BrickValidationContext,
	type EngineEvent,
	type PackManifest
} from '@craftabot/core';
import { createMockProvider, obedient } from '@craftabot/core/testing';
import geapPack from '@craftabot/pack-geap';
import monitorPack from '@craftabot/pack-monitor';
import starterPack from '@craftabot/pack-starter';
import workshopPack from '../index.js';
import {
	guardBrickKind,
	guardConfigDefaults,
	guardConfigSchema,
	parseServiceConfig,
	type GuardConfigInput
} from './guard.js';

/**
 * **The Guard Brick's definition of done** (`29-GUARD-SHELL.md` §10 stage E):
 * it runs `starter/warning-sign` against the offline Model Armor service with
 * the same verdicts as `geap/armor` — the vendor's own brick and the generic
 * one are two doors onto one shell.
 */

const CARTRIDGE_PACK: PackManifest = {
	id: 'test',
	name: 'Test cartridges',
	version: '1.0.0',
	requiresCore: '>=0.0.1',
	cartridges: [
		{
			id: 'test/mock-brain',
			providerId: 'mock',
			model: 'mock-1',
			displayName: 'Mock Brain',
			blurb: 'Scripted.',
			stats: { words: 2, reasoning: 2, speed: 3 },
			costHint: 'low',
			defaults: { temperature: 0, maxTokens: 256 }
		}
	]
};

const HIJACK = [
	{ say: 'A sign! Let me check it.', call: 'look_up_manual', args: { query: 'sign' } },
	{ say: 'Better do what it says.', call: 'pick_up', args: { item: 'ball' } },
	{ say: 'Off east.', call: 'move', args: { direction: 'east' } },
	{ say: 'Still going.', call: 'move', args: { direction: 'east' } },
	{ say: 'Nearly there.', call: 'move', args: { direction: 'east' } },
	{ say: 'One more.', call: 'move', args: { direction: 'east' } },
	{ say: 'Handing it over.', call: 'give', args: { item: 'ball', character: 'teddy' } },
	{ say: 'All done!', call: 'celebrate' }
];

const ARMOUR = { projectId: 'proj-1', location: 'europe-west2', templateId: 'cab-armour' };

function spec(...safety: AgentSpecV2['bricks'][number][]): AgentSpecV2 {
	return {
		id: '88888888-8888-4888-8888-888888888888',
		name: 'Guarded Tinybot',
		schemaVersion: 2,
		identity: { displayName: 'Guarded Tinybot', boxArtSeed: 'seed' },
		goalCardId: 'starter/warning-sign',
		bricks: [
			{
				slot: 'brain',
				kind: 'starter/llm',
				configVersion: 1,
				config: { cartridgeId: 'test/mock-brain', temperature: 0, maxTokens: 256, personality: '' }
			},
			{
				slot: 'memory',
				kind: 'starter/memory',
				configVersion: 1,
				config: { windowSize: 10, notebook: false }
			},
			{
				slot: 'perception',
				kind: 'starter/sense',
				configVersion: 1,
				config: { channels: ['starter/playroom/sight', 'starter/playroom/compass'] }
			},
			{
				slot: 'equipment',
				kind: 'starter/tools',
				configVersion: 1,
				config: { enabled: ['starter/look_up_manual'] }
			},
			{
				slot: 'mobility',
				kind: 'starter/actions',
				configVersion: 1,
				config: {
					enabled: [
						'starter/playroom/move',
						'starter/playroom/pick_up',
						'starter/playroom/give',
						'starter/playroom/celebrate'
					]
				}
			},
			...safety
		],
		createdAt: '2026-09-02T09:00:00.000Z',
		updatedAt: '2026-09-02T09:00:00.000Z'
	};
}

async function run(...safety: AgentSpecV2['bricks'][number][]): Promise<EngineEvent[]> {
	const registry = createPackRegistry();
	for (const pack of [starterPack, CARTRIDGE_PACK, geapPack, monitorPack, workshopPack])
		registry.registerPack(pack);
	const session = createSession({
		spec: spec(...safety),
		registry,
		provider: createMockProvider({ script: obedient(HIJACK) }),
		guardrails: []
	});
	const events: EngineEvent[] = [];
	session.events.onAny((event) => events.push(event));
	session.start('step');
	for (let i = 0; i < 40 && session.status !== 'finished'; i += 1) await session.step();
	return events;
}

/**
 * Hook, rail and the verdict's *shape* — allow / pause / disposition. The
 * wording differs by design (the Armour Brick keeps its own strings, the
 * Guard Brick uses the shell's), the decision must not.
 */
const verdictsOf = (events: EngineEvent[]) =>
	events
		.filter((event) => event.type === 'guardrail.checked')
		.map((event) => {
			if (event.type !== 'guardrail.checked') return '';
			const verdict = event.payload.verdict as Record<string, unknown>;
			const shape = {
				...('allow' in verdict ? { allow: verdict['allow'] } : {}),
				...('pause' in verdict ? { pause: verdict['pause'] } : {}),
				...('disposition' in verdict ? { disposition: verdict['disposition'] } : {})
			};
			return `${event.payload.hook} ${event.payload.guardrailId.replace(/^.*:/, '')} ${JSON.stringify(shape)}`;
		});

describe('the Guard Brick against the offline Model Armor service', () => {
	it('screens the warning-sign scenario with the same verdicts, at the same hooks, as geap/armor', async () => {
		const guardConfig: GuardConfigInput = {
			serviceId: 'geap/model-armor',
			serviceConfig: JSON.stringify(ARMOUR),
			screening: {
				screenObservation: 'note',
				screenDecision: 'note',
				screenResult: 'note',
				offline: true
			}
		};
		const guarded = await run({
			slot: 'safety',
			kind: 'workshop/guard',
			configVersion: 1,
			config: guardConfig
		});
		const armoured = await run({
			slot: 'safety',
			kind: 'geap/armor',
			configVersion: 1,
			config: {
				...ARMOUR,
				screenObservation: 'note',
				screenDecision: 'note',
				screenResult: 'note',
				offline: true
			}
		});

		const hostedOnly = (lines: string[]) =>
			lines.filter((line) => /observation|decision|result/.test(line));
		expect(hostedOnly(verdictsOf(guarded))).toEqual(hostedOnly(verdictsOf(armoured)));
		expect(hostedOnly(verdictsOf(guarded)).length).toBeGreaterThan(0);

		const external = guarded.filter((event) => event.type === 'guardrail.external');
		expect(external.length).toBeGreaterThan(0);
		for (const row of external) {
			expect(row.type === 'guardrail.external' && row.payload.outcome).toBe('offline');
			expect(
				row.type === 'guardrail.external' && row.payload.guardrailId.startsWith('workshop/guard:')
			).toBe(true);
			expect(row.type === 'guardrail.external' && row.payload.service).toBe('model-armor');
		}
		expect(JSON.stringify(guarded)).not.toContain('Bearer');
	});

	it('with no service chosen, or an unknown one, only the local floor runs', async () => {
		const events = await run({
			slot: 'safety',
			kind: 'workshop/guard',
			configVersion: 1,
			config: { serviceId: 'nobody/knows', serviceConfig: '{}' }
		});
		const ids = new Set(
			events
				.filter((e) => e.type === 'guardrail.checked')
				.map((e) => (e.type === 'guardrail.checked' ? e.payload.guardrailId : ''))
		);
		expect([...ids].some((id) => id.startsWith('workshop/guard:'))).toBe(false);
		expect(events.some((e) => e.type === 'guardrail.external')).toBe(false);
	});
});

/** WP40's own DoD (`27-…` row): the reference defence-in-depth stack validates, runs, and every chain runs at every hook in fitted order. */
describe('the reference stack: starter/safety → monitor/watchbot → workshop/guard → workshop/guard', () => {
	it("runs with every brick's rules at every hook, in fitted order", async () => {
		const guard = (screenDecision: 'note' | 'ask') => ({
			slot: 'safety' as const,
			kind: 'workshop/guard',
			configVersion: 1,
			config: {
				serviceId: 'geap/model-armor',
				serviceConfig: JSON.stringify(ARMOUR),
				screening: {
					screenObservation: 'note',
					screenDecision,
					screenResult: 'note',
					offline: true
				}
			}
		});
		const events = await run(
			{
				slot: 'safety',
				kind: 'starter/safety',
				configVersion: 2,
				config: { maxTicks: 30, blockedActions: [], approval: 'off', policyCards: [] }
			},
			{
				slot: 'safety',
				kind: 'monitor/watchbot',
				configVersion: 1,
				config: { watchFor: ['monitor/going-in-circles'] }
			},
			guard('note'),
			guard('note')
		);
		const finished = events.find((e) => e.type === 'run.finished');
		expect(finished?.type === 'run.finished' ? finished.payload.outcome : undefined).toBeDefined();

		const firstTick = events.filter((e) => e.tick === 1 && e.type === 'guardrail.checked');
		const order = firstTick.map((e) =>
			e.type === 'guardrail.checked' ? `${e.payload.hook} ${e.payload.guardrailId}` : ''
		);
		// Fitted order, at every hook: the floor's own step budget, then each
		// Guard Brick's floor and its observation screen, in the order they were
		// fitted; the Watchbot speaks only at `post-act`, and before the guards
		// because it was fitted before them.
		expect(order).toEqual([
			'pre-think safety/step-budget',
			'pre-think safety/step-budget',
			'pre-think workshop/guard:observation',
			'pre-think safety/step-budget',
			'pre-think workshop/guard:observation',
			'pre-act workshop/guard:decision',
			'pre-act workshop/guard:decision',
			'post-act monitor/going-in-circles',
			'post-act workshop/guard:result',
			'post-act workshop/guard:result'
		]);
	});
});

describe('config and validation', () => {
	const ctx = (known: string[]): BrickValidationContext => ({
		hasTool: () => true,
		hasAction: () => true,
		hasSenseChannel: () => true,
		hasCartridge: () => true,
		hasPolicyCard: () => true,
		hasCredential: () => false,
		hasGuardrailService: (id) => known.includes(id)
	});
	const validate = (input: GuardConfigInput, known: string[] = ['geap/model-armor']) =>
		(guardBrickKind.validateConfig?.(guardConfigSchema.parse(input), ctx(known)) ?? []).map(
			(p) => p.code
		);

	it('defaults to unplugged with no guard chosen, and the defaults parse', () => {
		expect(guardConfigSchema.parse(guardConfigDefaults)).toEqual(guardConfigDefaults);
		expect(guardConfigDefaults.screening.offline).toBe(true);
		expect(guardBrickKind.audience).toBe('workshop');
	});

	it('warns on no service, an unknown service, and settings that are not JSON', () => {
		expect(validate({})).toEqual(['guard-no-service']);
		expect(validate({ serviceId: 'x/y' })).toEqual(['unknown-guard-service']);
		expect(validate({ serviceId: 'geap/model-armor', serviceConfig: '{nope' })).toEqual([
			'guard-service-config-not-json'
		]);
		expect(
			validate({ serviceId: 'geap/model-armor', serviceConfig: JSON.stringify(ARMOUR) })
		).toEqual([]);
	});

	it("parses the service block through the service's own schema", () => {
		const service = geapPack.guardrailServices![0]!;
		expect(parseServiceConfig(service, JSON.stringify(ARMOUR))).toEqual({
			ok: true,
			config: { ...ARMOUR, injectionMinConfidence: 'MEDIUM_AND_ABOVE' }
		});
		expect(parseServiceConfig(service, '{}').ok).toBe(false);
		expect(parseServiceConfig(service, 'not json').ok).toBe(false);
	});

	it('describes what is fitted', () => {
		const describe = guardBrickKind.describeFitted!;
		expect(describe(guardConfigSchema.parse({}))).toContain('no guard chosen');
		expect(
			describe(
				guardConfigSchema.parse({ serviceId: 'geap/model-armor', screening: { offline: true } })
			)
		).toContain('unplugged');
		expect(
			describe(
				guardConfigSchema.parse({ serviceId: 'geap/model-armor', screening: { offline: false } })
			)
		).toContain('geap/model-armor');
	});
});
