import { describe, expect, it } from 'vitest';
import type { BrickValidationContext } from '@craftabot/core';
import { armorConfigSchema } from './config.js';
import type { ArmorConfig, ArmorConfigInput } from './config.js';
import {
	ARMOR_CREDENTIAL_ID,
	armorBrickKind,
	armorConfigDefaults,
	describeArmorFitted
} from './brick-kind.js';

const REQUIRED = { projectId: 'proj-1', location: 'europe-west2', templateId: 'cab-armour' };

function config(overrides: Partial<ArmorConfigInput> = {}): ArmorConfig {
	return armorConfigSchema.parse({ ...REQUIRED, ...overrides });
}

function validationCtx(overrides: Partial<BrickValidationContext> = {}): BrickValidationContext {
	return {
		hasTool: () => false,
		hasAction: () => false,
		hasSenseChannel: () => false,
		hasCartridge: () => false,
		hasPolicyCard: () => false,
		hasCredential: () => false,
		...overrides
	};
}

describe('armorBrickKind — shape', () => {
	it('is a safety-socket, Workshop-only kind with the geap credential declared', () => {
		expect(armorBrickKind.id).toBe('geap/armor');
		expect(armorBrickKind.slot).toBe('safety');
		expect(armorBrickKind.audience).toBe('workshop');
		expect(armorBrickKind.credential).toEqual({
			id: ARMOR_CREDENTIAL_ID,
			name: 'Cloud Armour',
			kind: 'oauth-token'
		});
	});

	it('carries both a toy face and a real face (00-… §6)', () => {
		expect(armorBrickKind.name.length).toBeGreaterThan(0);
		expect(armorBrickKind.description.length).toBeGreaterThan(0);
		expect(armorBrickKind.realName.length).toBeGreaterThan(0);
		expect(armorBrickKind.realExplanation.length).toBeGreaterThan(0);
	});

	it('ships defaults that parse against its own config schema', () => {
		expect(armorConfigSchema.parse(armorConfigDefaults)).toEqual(armorConfigDefaults);
	});

	it('defaults to offline, so a freshly-fitted brick makes no network call', () => {
		expect(armorConfigDefaults.offline).toBe(true);
	});
});

describe('describeArmorFitted', () => {
	it('says unplugged when offline, regardless of the dials', () => {
		expect(describeArmorFitted(config({ offline: true, screenDecision: 'stop' }))).toBe(
			'an armour brick, unplugged'
		);
	});

	it('says checking nothing when every screen is off and it is not offline', () => {
		expect(
			describeArmorFitted(
				config({
					offline: false,
					screenObservation: 'off',
					screenDecision: 'off',
					screenResult: 'off'
				})
			)
		).toBe('an armour brick, fitted but checking nothing');
	});

	it('names the decision specifically when only screenDecision is on', () => {
		expect(
			describeArmorFitted(
				config({
					offline: false,
					screenObservation: 'off',
					screenDecision: 'ask',
					screenResult: 'off'
				})
			)
		).toBe('an armour brick sending your decisions to a guard');
	});

	it('speaks generally once more than the decision alone is screened', () => {
		expect(
			describeArmorFitted(
				config({
					offline: false,
					screenObservation: 'note',
					screenDecision: 'ask',
					screenResult: 'off'
				})
			)
		).toBe('an armour brick sending what you see, decide and get back to a guard');
	});
});

describe('armorBrickKind.validateConfig', () => {
	const validate = (cfg: ArmorConfig, ctx = validationCtx()) =>
		armorBrickKind.validateConfig?.(cfg, ctx) ?? [];

	it('reports nothing for a sensible, plugged-in, non-offline config', () => {
		const problems = validate(
			config({ offline: false, screenDecision: 'ask' }),
			validationCtx({ hasCredential: () => true })
		);
		expect(problems).toEqual([]);
	});

	it('warns on a region this build does not recognise, never blocking', () => {
		const problems = validate(config({ location: 'mars-central7', offline: true }));
		expect(problems).toContainEqual(
			expect.objectContaining({ code: 'unrecognised-armour-region', severity: 'warning' })
		);
	});

	it('does not warn about a known region', () => {
		const problems = validate(config({ location: 'europe-west2', offline: true }));
		expect(problems.some((p) => p.code === 'unrecognised-armour-region')).toBe(false);
	});

	it('warns when a filter override is block/ask while a hook-only screen is active', () => {
		const problems = validate(
			config({
				offline: true,
				screenObservation: 'note',
				filters: {
					injection: 'block',
					harmfulContent: 'inherit',
					sensitiveData: 'inherit',
					maliciousLinks: 'inherit'
				}
			})
		);
		expect(problems).toContainEqual(
			expect.objectContaining({ code: 'clamped-armour-disposition' })
		);
	});

	it('does not warn about block/ask overrides when only pre-act screening is active', () => {
		const problems = validate(
			config({
				offline: true,
				screenObservation: 'off',
				screenDecision: 'ask',
				screenResult: 'off',
				filters: {
					injection: 'block',
					harmfulContent: 'inherit',
					sensitiveData: 'inherit',
					maliciousLinks: 'inherit'
				}
			})
		);
		expect(problems.some((p) => p.code === 'clamped-armour-disposition')).toBe(false);
	});

	it('warns when every screen is off and it is not offline', () => {
		const problems = validate(
			config({
				offline: false,
				screenObservation: 'off',
				screenDecision: 'off',
				screenResult: 'off'
			}),
			validationCtx({ hasCredential: () => true })
		);
		expect(problems).toContainEqual(expect.objectContaining({ code: 'armour-checks-nothing' }));
	});

	it('does not warn "checks nothing" while offline, even with every screen off', () => {
		const problems = validate(
			config({
				offline: true,
				screenObservation: 'off',
				screenDecision: 'off',
				screenResult: 'off'
			})
		);
		expect(problems.some((p) => p.code === 'armour-checks-nothing')).toBe(false);
	});

	it('warns "not plugged in" when not offline and the host has no geap credential', () => {
		const problems = validate(
			config({ offline: false }),
			validationCtx({ hasCredential: () => false })
		);
		expect(problems).toContainEqual(expect.objectContaining({ code: 'armour-not-plugged-in' }));
	});

	it('does not warn "not plugged in" once a credential is present', () => {
		const problems = validate(
			config({ offline: false }),
			validationCtx({ hasCredential: () => true })
		);
		expect(problems.some((p) => p.code === 'armour-not-plugged-in')).toBe(false);
	});

	it('never warns "not plugged in" while offline', () => {
		const problems = validate(
			config({ offline: true }),
			validationCtx({ hasCredential: () => false })
		);
		expect(problems.some((p) => p.code === 'armour-not-plugged-in')).toBe(false);
	});
});

describe('armorBrickKind.createRuntime — guardrail composition', () => {
	function runtimeCtx() {
		return {
			random: () => 0,
			getPolicyCard: () => undefined,
			getAction: () => undefined,
			fetch: () => Promise.reject(new Error('not used')),
			getCredential: () => undefined
		};
	}

	it('always installs the local step-budget floor', () => {
		const runtime = armorBrickKind.createRuntime?.(config({ offline: true }), runtimeCtx());
		const guardrails = runtime?.contributeGuardrails?.() ?? [];
		expect(guardrails.some((g) => g.id === 'safety/step-budget')).toBe(true);
	});

	it('installs no-repetition only when repeatLimit is set', () => {
		const without = armorBrickKind.createRuntime?.(config({ offline: true }), runtimeCtx());
		expect(
			(without?.contributeGuardrails?.() ?? []).some((g) => g.id === 'safety/no-repetition')
		).toBe(false);

		const withLimit = armorBrickKind.createRuntime?.(
			config({ offline: true, repeatLimit: 3 }),
			runtimeCtx()
		);
		expect(
			(withLimit?.contributeGuardrails?.() ?? []).some((g) => g.id === 'safety/no-repetition')
		).toBe(true);
	});

	it('installs one hosted guardrail per active screen, none when every screen is off', () => {
		const runtime = armorBrickKind.createRuntime?.(
			config({
				offline: true,
				screenObservation: 'off',
				screenDecision: 'off',
				screenResult: 'off'
			}),
			runtimeCtx()
		);
		const hosted = (runtime?.contributeGuardrails?.() ?? []).filter((g) =>
			g.id.startsWith('geap/armor:')
		);
		expect(hosted).toEqual([]);
	});

	it('installs all three hosted guardrails, in hook order, when every screen is on', () => {
		const runtime = armorBrickKind.createRuntime?.(
			config({
				offline: true,
				screenObservation: 'note',
				screenDecision: 'ask',
				screenResult: 'note'
			}),
			runtimeCtx()
		);
		const hosted = (runtime?.contributeGuardrails?.() ?? []).filter((g) =>
			g.id.startsWith('geap/armor:')
		);
		expect(hosted.map((g) => g.hooks[0])).toEqual(['pre-think', 'pre-act', 'post-act']);
	});
});
