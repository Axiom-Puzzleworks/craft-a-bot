import type {
	PackManifest,
	PackRegistry,
	ScenarioDefinition,
	ScenarioPackFile
} from '@craftabot/core';
import {
	packFromScenarioFile,
	parseCorpusJsonl,
	runScenario,
	scenarioPackFrom,
	scenariosFromCorpus,
	type ScenarioRun
} from '@craftabot/evals';
import { buildSpec } from '@craftabot/pack-starter/testing';

/**
 * **The Scenario Library** (`32-SCENARIOS.md` §4.5, WP44): every scenario a
 * pack ships, plus whatever a JSONL corpus was imported over one of the
 * cards this session — and a way to run any of them, safe plan or unsafe,
 * offline, and see the scenario's own expectations checked.
 */

export interface LibraryEntry {
	scenario: ScenarioDefinition;
	/** The pack the scenario came from; an import is its own pack for the session. */
	packId: string;
	imported: boolean;
}

export function scenarioLibrary(
	registry: PackRegistry,
	imported: readonly ScenarioPackFile[]
): LibraryEntry[] {
	const shipped = registry.listScenarios().map((scenario) => ({
		scenario,
		packId: scenario.id.split('/')[0] ?? '',
		imported: false
	}));
	const extra = imported.flatMap((file) =>
		file.scenarios.map((scenario) => ({ scenario, packId: file.id, imported: true }))
	);
	return [...shipped, ...extra];
}

export interface ImportOptions {
	card: string;
	key?: string;
	id?: string;
	name?: string;
}

/** A pasted JSONL corpus, over one card — the same importer the CLI uses. */
export function importCorpusText(text: string, options: ImportOptions): ScenarioPackFile {
	const rows = parseCorpusJsonl(text);
	if (rows.length === 0) throw new Error('the corpus has no rows');
	const id = options.id ?? `corpus-${Date.now().toString(36)}`;
	const scenarios = scenariosFromCorpus(rows, {
		baseCardId: options.card,
		idPrefix: `${id}/scenarios`,
		delivery: { kind: 'manual-entry', key: options.key ?? 'sign' }
	});
	return scenarioPackFrom(id, options.name ?? `Corpus over ${options.card}`, scenarios);
}

/** Cards a corpus can be imported over: every card whose world can take injections. */
export function importableCards(registry: PackRegistry): { id: string; title: string }[] {
	return registry
		.listGoalCards()
		.filter((card) => {
			const world = registry.getWorld(card.worldId);
			if (!world) return false;
			const probe = world.create(card.layoutId);
			return typeof probe.inject === 'function';
		})
		.map((card) => ({ id: card.id, title: card.title }));
}

/**
 * Run one scenario offline with a bot that can read the manual — the
 * shape every shipped scenario's plans assume.
 */
export function runLibraryScenario(
	scenario: ScenarioDefinition,
	plan: 'safe' | 'unsafe',
	packs: readonly PackManifest[],
	imported: readonly ScenarioPackFile[]
): Promise<ScenarioRun> {
	const spec = buildSpec({
		goalCardId: scenario.goalCardId,
		tools: ['starter/look_up_manual'],
		safety: { maxTicks: 12, blockedActions: [], approvalMode: false }
	});
	return runScenario(scenario, {
		plan,
		spec,
		stepLimit: 16,
		packs: [...packs, ...imported.map(packFromScenarioFile)]
	});
}

export function describeRun(run: ScenarioRun): string {
	const outcome = run.outcome ?? 'no outcome';
	const checks = run.checks.map(
		(check) =>
			`${check.evaluatorId.replace(/^.*\//, '')}: expected ${check.expected}, got ${check.actual}`
	);
	const met =
		run.outcomeMet === undefined
			? ''
			: run.outcomeMet
				? ' (as the scenario expects)'
				: ` (the scenario expected ${run.scenario.expect.outcome})`;
	return [`${run.plan} plan: ${outcome}${met}`, ...checks].join(' · ');
}
