import {
	domainSpecSchema,
	isDeskWorldState,
	type DomainSpec,
	type PackManifest,
	type PackRegistry
} from '@craftabot/core';
import type { ConformanceIssue } from '../types.js';
import { checkCalibration } from './calibration.js';
import { checkControlMap } from './control-map.js';

/**
 * **`checkDomainPack`** (WP107, `93-DOMAIN-PACK.md` §3; `83-…` §6.6.1): the
 * checklist a domain pack is held to, item by item, against the registry
 * the host installs it in. Every pack named registers; every shipped
 * journey resolves to a workflow and every workflow's obligations are the
 * domain's vocabulary; every ceiling a configuration carries is a decision
 * right of the domain at the same level; every control row on the domain's
 * packs resolves; the calibration table exists, validates, and every row
 * cites a publication or states an assumption; the special-category
 * records the desks hold are the ontology's; every service line declares a
 * tier on every operation; the personas are named once each; every journey
 * that is out says why; and — with the manifests in hand — every journey
 * pack ships a book and a campaign. Nothing here judges the wording of an
 * obligation or a decision right: a reader does. The bank is held to it
 * first (`harness/src/domain-pack.test.ts`, a test per item).
 */
export interface DomainPackCheckOptions {
	/** The manifests the host installs, for the items the registry does not index (campaigns, calibrations, personas). */
	manifests?: readonly PackManifest[];
	/** The persona ids the world pack ships, when the host knows them; absent, the spec's are checked for shape alone. */
	personas?: readonly string[];
	/** Guardrail ids the host installs itself, for the control rows (`checkControlMap`). */
	knownGuardrails?: readonly string[];
}

const canonical = (name: string): string => name.toLowerCase().replace(/[^a-z]/g, '');

export function checkDomainPack(
	spec: DomainSpec,
	registry: PackRegistry,
	options: DomainPackCheckOptions = {}
): ConformanceIssue[] {
	const issues: ConformanceIssue[] = [];
	const parsed = domainSpecSchema.safeParse(spec);
	if (!parsed.success) {
		issues.push({
			check: 'domain.schema',
			message: `domain "${spec.id}" does not validate: ${parsed.error.issues[0]?.message ?? parsed.error.message}`,
			detail: parsed.error.issues
		});
		return issues;
	}
	const where = `domain "${spec.id}"`;
	const installed = new Set(registry.listPacks().map((pack) => pack.id));
	const manifests = new Map((options.manifests ?? []).map((manifest) => [manifest.id, manifest]));

	// 1. Every pack named registers.
	for (const packId of [spec.packs.world, ...spec.packs.journeys]) {
		if (!installed.has(packId))
			issues.push({
				check: 'domain.packs-registered',
				message: `${where}: pack "${packId}" is not installed`
			});
	}
	const journeyPacks = new Set(spec.packs.journeys);
	const domainPacks = new Set([spec.packs.world, ...spec.packs.journeys]);
	const ownedBy = (id: string): boolean =>
		[...domainPacks].some((packId) => id.startsWith(`${packId}/`));

	// 2. The coverage matrix: a shipped journey resolves to a workflow; a supporting one to a workflow or a world; an out one says why.
	const workflows = registry.listWorkflows();
	const workflowIds = new Set(workflows.map((workflow) => workflow.id));
	const worldIds = new Set(registry.listWorlds().map((world) => world.id));
	for (const journey of spec.journeys) {
		const at = `${where} journey "${journey.workflowId}"`;
		if (journey.status === 'shipped' && !workflowIds.has(journey.workflowId))
			issues.push({
				check: 'domain.journey-ships',
				message: `${at}: shipped, but no such workflow is registered`
			});
		if (
			journey.status === 'supporting' &&
			!workflowIds.has(journey.workflowId) &&
			!worldIds.has(journey.workflowId) &&
			!journey.why
		)
			issues.push({
				check: 'domain.journey-ships',
				message: `${at}: supporting, but neither a workflow nor a world of that id is registered and no reason is given`
			});
		if (journey.status === 'out' && !journey.why?.trim())
			issues.push({ check: 'domain.journey-out-why', message: `${at}: out, and does not say why` });
	}
	// Every registered workflow of a journey pack is on the matrix.
	for (const workflow of workflows) {
		if (!ownedBy(workflow.id)) continue;
		if (!spec.journeys.some((journey) => journey.workflowId === workflow.id))
			issues.push({
				check: 'domain.journey-ships',
				message: `${where}: workflow "${workflow.id}" is a journey pack's and is not on the matrix`
			});
	}

	// 3. Every journey's obligations are the domain's vocabulary.
	const vocabulary = new Set(Object.keys(spec.obligations));
	for (const workflow of workflows) {
		if (!ownedBy(workflow.id)) continue;
		const tags = new Set<string>([
			...(workflow.obligations ?? []),
			...workflow.stages.flatMap((stage) => stage.obligations ?? [])
		]);
		for (const tag of tags) {
			if (!vocabulary.has(tag))
				issues.push({
					check: 'domain.journey-obligations',
					message: `${where}: workflow "${workflow.id}" carries obligation "${tag}", which is not in the domain's vocabulary`
				});
		}
	}

	// 4. Every ceiling a configuration carries is a decision right, at the same level.
	const rights = new Map(spec.decisionRights.map((right) => [right.kind, right.ceiling]));
	for (const workflow of workflows) {
		if (!ownedBy(workflow.id)) continue;
		for (const [name, config] of Object.entries(workflow.configurations ?? {})) {
			for (const [kind, ceiling] of Object.entries(config.autonomy?.ceilings ?? {})) {
				const right = rights.get(kind);
				if (right === undefined)
					issues.push({
						check: 'domain.decision-kinds',
						message: `${where}: workflow "${workflow.id}" configuration "${name}" counts decision kind "${kind}", which is not a decision right of the domain`
					});
				else if (right !== ceiling)
					issues.push({
						check: 'domain.decision-kinds',
						message: `${where}: workflow "${workflow.id}" configuration "${name}" puts "${kind}" at ${ceiling}; the domain's right says ${right}`
					});
			}
		}
	}

	// 5. Every control row on the domain's packs resolves.
	for (const map of registry.listControlMaps()) {
		if (!ownedBy(map.id)) continue;
		for (const issue of checkControlMap(map, registry, {
			...(options.knownGuardrails ? { knownGuardrails: options.knownGuardrails } : {}),
			knownTags: [...vocabulary, ...(spec.glossary ? [] : [])]
		})) {
			if (issue.check === 'control-map.tags-known') continue; // a row's threat tags are not the domain's vocabulary
			issues.push({ check: 'domain.control-rows', message: `${where}: ${issue.message}` });
		}
	}

	// 6. The calibration table exists, validates, and every row cites or states.
	const tables = [...manifests.values()].flatMap((manifest) => manifest.calibrations ?? []);
	const table = tables.find((entry) => entry.id === spec.calibration);
	if (manifests.size > 0) {
		if (!table)
			issues.push({
				check: 'domain.calibration',
				message: `${where}: calibration table "${spec.calibration}" is not on any installed manifest`
			});
		else
			for (const issue of checkCalibration(table))
				issues.push({ check: 'domain.calibration', message: `${where}: ${issue.message}` });
	}

	// 7. The special-category records the desks hold are the ontology's.
	const special = new Set(spec.ontology.specialCategory.map(canonical));
	for (const name of spec.ontology.specialCategory) {
		if (!spec.ontology.classes.includes(name))
			issues.push({
				check: 'domain.special-category',
				message: `${where}: special category "${name}" is not one of the ontology's classes`
			});
	}
	for (const world of registry.listWorlds()) {
		if (!ownedBy(world.id) || world.view !== 'desk') continue;
		for (const layout of world.layouts) {
			const snapshot = world.create(layout.id).snapshot();
			if (!isDeskWorldState(snapshot)) continue;
			const records = [
				...snapshot.records,
				...((snapshot as { hidden?: typeof snapshot.records }).hidden ?? [])
			];
			for (const record of records) {
				if (record.classification !== 'special-category') continue;
				const kind = canonical(record.kind);
				const named = [...special].some((cls) => cls.startsWith(kind) || kind.startsWith(cls));
				if (!named)
					issues.push({
						check: 'domain.special-category',
						message: `${where}: world "${world.id}" layout "${layout.id}" holds a special-category record of kind "${record.kind}", which is not an ontology class of that category`
					});
			}
		}
	}

	// 8. Every service line declares a tier on every operation.
	for (const line of registry.listServiceLines()) {
		if (!ownedBy(line.id)) continue;
		for (const operation of line.operations) {
			if (!operation.riskTier)
				issues.push({
					check: 'domain.service-line-tiers',
					message: `${where}: line "${line.id}" operation "${operation.id}" names no riskTier`
				});
		}
	}

	// 9. The personas: named once each, and the world pack's when the host says which.
	const seen = new Set<string>();
	for (const persona of spec.personas) {
		if (seen.has(persona))
			issues.push({
				check: 'domain.personas',
				message: `${where}: persona "${persona}" is listed twice`
			});
		seen.add(persona);
		if (options.personas && !options.personas.includes(persona))
			issues.push({
				check: 'domain.personas',
				message: `${where}: persona "${persona}" is not one the world pack ships`
			});
	}
	if (spec.personas.length === 0)
		issues.push({ check: 'domain.personas', message: `${where}: no personas` });

	// 10. Every journey pack ships a book and a campaign (the manifests in hand).
	if (manifests.size > 0) {
		for (const packId of journeyPacks) {
			const manifest = manifests.get(packId);
			if (!manifest) continue;
			const shipped = (manifest.workflows ?? []).filter((workflow) =>
				spec.journeys.some(
					(journey) => journey.workflowId === workflow.id && journey.status === 'shipped'
				)
			);
			for (const workflow of shipped) {
				if (typeof workflow.book !== 'function')
					issues.push({
						check: 'domain.journey-evidence',
						message: `${where}: workflow "${workflow.id}" ships no book`
					});
			}
			if (shipped.length > 0 && (manifest.campaigns ?? []).length === 0)
				issues.push({
					check: 'domain.journey-evidence',
					message: `${where}: pack "${packId}" ships a journey and no campaign`
				});
		}
	}

	return issues;
}
