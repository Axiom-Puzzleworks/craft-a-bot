import {
	createPackRegistry,
	type DomainSpec,
	type PackManifest,
	type WorkflowSpec
} from '@craftabot/core';
import { GOVERNANCE_GUARDRAIL_IDS } from '@craftabot/governance/reports';
import { PERSONA_IDS, ukRetailBankingDomain } from '@craftabot/pack-fs-bank';
import { checkCalibration, checkDomainPack } from '@craftabot/pack-testkit';
import { describe, expect, it } from 'vitest';
import { createRegistry, defaultConfig, defaultPacks } from './config.js';

/**
 * WP107 (`93-DOMAIN-PACK.md` §3; `83-…` §14 item 9): `checkDomainPack` is
 * green on the bank, and red when any one item is taken away — a test per
 * item, each removing or bending one thing the checklist holds the domain
 * to, so the check checks.
 */
const registry = createRegistry(defaultConfig());
const manifests = defaultPacks();
const spec = ukRetailBankingDomain;
const options = { manifests, personas: PERSONA_IDS, knownGuardrails: GOVERNANCE_GUARDRAIL_IDS };

const checks = (issues: ReturnType<typeof checkDomainPack>) => [
	...new Set(issues.map((issue) => issue.check))
];

describe('checkDomainPack on the bank', () => {
	it('is green: every item met', () => {
		const issues = checkDomainPack(spec, registry, options);
		expect(issues.map((issue) => `${issue.check}: ${issue.message}`)).toEqual([]);
	});

	it('the calibration is cited on every row, and still pending review (a reader has not read it)', () => {
		const table = manifests
			.flatMap((manifest) => manifest.calibrations ?? [])
			.find((entry) => entry.id === spec.calibration);
		expect(table).toBeDefined();
		expect(checkCalibration(table!)).toEqual([]);
		expect(checks(checkCalibration(table!, { requireReview: true }))).toEqual([
			'calibration.review-pending'
		]);
	});

	it('red: a pack named that is not installed', () => {
		const bent: DomainSpec = {
			...spec,
			packs: { ...spec.packs, journeys: [...spec.packs.journeys, 'fs-mortgages'] }
		};
		expect(checks(checkDomainPack(bent, registry, options))).toContain('domain.packs-registered');
	});

	it('red: a journey shipped that no workflow answers to; a journey out that says nothing', () => {
		const ghost: DomainSpec = {
			...spec,
			journeys: [
				...spec.journeys,
				{ workflowId: 'fs-bank/ghost', name: 'Ghost', status: 'shipped' }
			]
		};
		expect(checks(checkDomainPack(ghost, registry, options))).toContain('domain.journey-ships');
		const mute: DomainSpec = {
			...spec,
			journeys: spec.journeys.map((journey) =>
				journey.status === 'out' ? { ...journey, why: undefined } : journey
			)
		};
		expect(checks(checkDomainPack(mute, registry, options))).toContain('domain.journey-out-why');
		const missing: DomainSpec = {
			...spec,
			journeys: spec.journeys.filter((journey) => journey.workflowId !== 'fs-lending/lending')
		};
		expect(checks(checkDomainPack(missing, registry, options))).toContain('domain.journey-ships');
	});

	it('red: an obligation a journey carries that the vocabulary lacks', () => {
		const { 'mlr:kyc': _dropped, ...rest } = spec.obligations;
		void _dropped;
		const bent: DomainSpec = { ...spec, obligations: rest };
		expect(checks(checkDomainPack(bent, registry, options))).toContain(
			'domain.journey-obligations'
		);
	});

	it('red: a ceiling a configuration counts that is no decision right, or at another level', () => {
		const dropped: DomainSpec = {
			...spec,
			decisionRights: spec.decisionRights.filter((right) => right.kind !== 'account-open')
		};
		expect(checks(checkDomainPack(dropped, registry, options))).toContain('domain.decision-kinds');
		const moved: DomainSpec = {
			...spec,
			decisionRights: spec.decisionRights.map((right) =>
				right.kind === 'account-open' ? { ...right, ceiling: 2 } : right
			)
		};
		expect(checks(checkDomainPack(moved, registry, options))).toContain('domain.decision-kinds');
	});

	it('red: a control row that cites an evaluator no pack ships', () => {
		const bent = createPackRegistry();
		for (const manifest of manifests) {
			if (manifest.id !== 'fs-onboarding') {
				bent.registerPack(manifest);
				continue;
			}
			const map = manifest.controlMaps![0]!;
			bent.registerPack({
				...manifest,
				controlMaps: [
					{
						...map,
						rows: [
							{ ...map.rows[0]!, evidence: [{ kind: 'evaluator', id: 'fs-onboarding/ghost' }] }
						]
					}
				]
			});
		}
		expect(checks(checkDomainPack(spec, bent, options))).toContain('domain.control-rows');
	});

	it('red: a calibration table not on any manifest, or a row that neither cites nor states', () => {
		const bent: DomainSpec = { ...spec, calibration: 'fs-bank/ghost-table' };
		expect(checks(checkDomainPack(bent, registry, options))).toContain('domain.calibration');
		const table = manifests
			.flatMap((manifest) => manifest.calibrations ?? [])
			.find((entry) => entry.id === spec.calibration)!;
		const unsaid = manifests.map((manifest): PackManifest =>
			manifest.id === 'fs-bank'
				? {
						...manifest,
						calibrations: [
							{
								...table,
								rows: table.rows.map((row, index) =>
									index === 0
										? { ...row, source: { kind: 'assumption', retrieved: '2026-09-12' }, note: '' }
										: row
								)
							}
						]
					}
				: manifest
		);
		expect(checks(checkDomainPack(spec, registry, { ...options, manifests: unsaid }))).toContain(
			'domain.calibration'
		);
	});

	it('red: a special-category record whose class is not named as one, or a named class that is no class', () => {
		const bent: DomainSpec = {
			...spec,
			ontology: { ...spec.ontology, specialCategory: [] }
		};
		expect(checks(checkDomainPack(bent, registry, options))).toContain('domain.special-category');
		const stranger: DomainSpec = {
			...spec,
			ontology: {
				...spec.ontology,
				specialCategory: [...spec.ontology.specialCategory, 'Stranger']
			}
		};
		expect(checks(checkDomainPack(stranger, registry, options))).toContain(
			'domain.special-category'
		);
	});

	it('red: a service line with an untiered operation', () => {
		const bent = createPackRegistry();
		for (const manifest of manifests) {
			if (manifest.id !== 'fs-bank') {
				bent.registerPack(manifest);
				continue;
			}
			const line = manifest.serviceLines![0]!;
			const untiered = {
				...line,
				operations: line.operations.map((operation, index) =>
					index === 0 ? { ...operation, riskTier: undefined as never } : operation
				)
			};
			bent.registerPack({
				...manifest,
				serviceLines: [untiered, ...manifest.serviceLines!.slice(1)]
			});
		}
		expect(checks(checkDomainPack(spec, bent, options))).toContain('domain.service-line-tiers');
	});

	it('red: a persona listed twice, or one the world pack does not ship', () => {
		const twice: DomainSpec = { ...spec, personas: [...spec.personas, spec.personas[0]!] };
		expect(checks(checkDomainPack(twice, registry, options))).toContain('domain.personas');
		const stranger: DomainSpec = { ...spec, personas: [...spec.personas, 'nobody'] };
		expect(checks(checkDomainPack(stranger, registry, options))).toContain('domain.personas');
	});

	it('red: a journey pack that ships a journey without a book, or without a campaign', () => {
		const bookless = manifests.map((manifest): PackManifest =>
			manifest.id === 'fs-onboarding'
				? {
						...manifest,
						workflows: manifest.workflows!.map((workflow): WorkflowSpec => {
							const { book: _book, ...rest } = workflow;
							void _book;
							return rest;
						})
					}
				: manifest
		);
		expect(checks(checkDomainPack(spec, registry, { ...options, manifests: bookless }))).toContain(
			'domain.journey-evidence'
		);
		const campaignless = manifests.map((manifest): PackManifest =>
			manifest.id === 'fs-onboarding' ? { ...manifest, campaigns: [] } : manifest
		);
		expect(
			checks(checkDomainPack(spec, registry, { ...options, manifests: campaignless }))
		).toContain('domain.journey-evidence');
	});

	it('red: a spec that does not validate', () => {
		const bent = { ...spec, schemaVersion: 2 } as unknown as DomainSpec;
		expect(checks(checkDomainPack(bent, registry, options))).toEqual(['domain.schema']);
	});
});
