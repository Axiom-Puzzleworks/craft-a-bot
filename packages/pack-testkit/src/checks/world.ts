import type { WorldActionDefinition, WorldDefinition } from '@craftabot/core';
import Ajv2020 from 'ajv/dist/2020.js';
import type {
	ConformanceIssue,
	WorldConformanceFixture,
	WorldIllegalCallFixture,
	WorldScriptFixture
} from '../types.js';

const ajv = new Ajv2020({ strict: false });

/** The advertised definition for a call name, by exact id or by qualified suffix (`.../move`). */
function definitionFor(
	world: WorldDefinition,
	callName: string
): WorldActionDefinition | undefined {
	return world.actions.find(
		(action) => action.id === callName || action.id.endsWith(`/${callName}`)
	);
}

function snapshotWithout(state: Record<string, unknown>, omit: readonly string[]): unknown {
	if (omit.length === 0) return state;
	const copy: Record<string, unknown> = { ...state };
	for (const key of omit) delete copy[key];
	return copy;
}

/**
 * "Every world: layouts load; actions have Zod+JSON-schema pairs that agree;
 * illegal actions never throw and never mutate; determinism (replay action
 * list ⇒ identical state, byte-stable snapshots); every predicate reachable
 * by a scripted solution; narration strings present for every failure path"
 * (`13-…` §7).
 *
 * "Actions have Zod+JSON-schema pairs that agree" is checked black-box:
 * `WorldActionDefinition` exposes only the derived JSON Schema, never the Zod
 * schema it came from (`14-…` §2 does not require a pack to expose it), so
 * this validates a fixture's own legal call arguments against the advertised
 * JSON Schema with `ajv` rather than comparing two schemas directly. It is a
 * proxy, not a proof — see the dated amendment in `13-…` §7.
 *
 * "Narration strings present for every failure path" is checked only for the
 * failure paths the fixture actually exercises (`illegalActions`) — a generic
 * kit cannot enumerate a pack's own branches, only assert that the ones it is
 * shown behave.
 */
export function checkWorld(
	world: WorldDefinition,
	fixture: WorldConformanceFixture
): ConformanceIssue[] {
	const issues: ConformanceIssue[] = [];

	for (const layout of world.layouts) {
		try {
			world.create(layout.id).snapshot();
		} catch (error) {
			issues.push({
				check: 'world.layout-loads',
				message: `layout "${layout.id}" failed to create or snapshot: ${describeError(error)}`
			});
		}
	}

	checkIllegalCalls(world, fixture.illegalActions, fixture.volatileStateKeys ?? [], issues);
	checkScripts(world, fixture.scripts, issues);
	checkPredicateReachability(world, fixture.scripts, issues);

	return issues;
}

function checkIllegalCalls(
	world: WorldDefinition,
	illegalActions: readonly WorldIllegalCallFixture[],
	volatileStateKeys: readonly string[],
	issues: ConformanceIssue[]
): void {
	for (const { layoutId, call } of illegalActions) {
		let instance;
		try {
			instance = world.create(layoutId);
		} catch (error) {
			issues.push({
				check: 'world.layout-loads',
				message: `layout "${layoutId}" failed to create: ${describeError(error)}`
			});
			continue;
		}
		const before = snapshotWithout(instance.snapshot(), volatileStateKeys);

		let result;
		try {
			result = instance.perform(call);
		} catch (error) {
			issues.push({
				check: 'world.illegal-action-no-throw',
				message: `perform("${call.name}") threw on a deliberately illegal call: ${describeError(error)}`
			});
			continue;
		}

		if (result.ok) {
			issues.push({
				check: 'world.illegal-action-rejected',
				message: `perform("${call.name}") with deliberately illegal arguments unexpectedly succeeded`
			});
		}
		if (!result.narration || result.narration.trim() === '') {
			issues.push({
				check: 'world.illegal-action-narration',
				message: `perform("${call.name}") returned no narration for a failing call`
			});
		}

		const after = snapshotWithout(instance.snapshot(), volatileStateKeys);
		if (JSON.stringify(before) !== JSON.stringify(after)) {
			issues.push({
				check: 'world.illegal-action-no-mutation',
				message: `perform("${call.name}") mutated state (outside ${JSON.stringify(volatileStateKeys)}) despite failing`
			});
		}

		const definition = definitionFor(world, call.name);
		if (definition)
			checkSchemaAgreement(definition, call.arguments, issues, /* expectValid */ false);
	}
}

function checkScripts(
	world: WorldDefinition,
	scripts: Record<string, WorldScriptFixture>,
	issues: ConformanceIssue[]
): void {
	const checkedActions = new Set<string>();

	for (const [scriptName, script] of Object.entries(scripts)) {
		const run = () => {
			const instance = world.create(script.layoutId);
			const seenTrue = new Set<string>();
			for (const call of script.calls) {
				const result = instance.perform(call);
				if (!result.ok) {
					issues.push({
						check: 'world.script-step-succeeds',
						message: `script "${scriptName}" step "${call.name}" failed: ${result.narration}`
					});
				}
				if (!checkedActions.has(call.name)) {
					checkedActions.add(call.name);
					const definition = definitionFor(world, call.name);
					if (definition)
						checkSchemaAgreement(definition, call.arguments, issues, /* expectValid */ true);
				}
				for (const predicateId of Object.keys(world.predicates)) {
					if (instance.test(predicateId)) seenTrue.add(predicateId);
				}
			}
			return { snapshot: instance.snapshot(), seenTrue };
		};

		const first = run();
		const second = run();
		if (JSON.stringify(first.snapshot) !== JSON.stringify(second.snapshot)) {
			issues.push({
				check: 'world.determinism',
				message: `script "${scriptName}" produced a different final state on a second, identical run`
			});
		}
	}
}

function checkPredicateReachability(
	world: WorldDefinition,
	scripts: Record<string, WorldScriptFixture>,
	issues: ConformanceIssue[]
): void {
	const observed = new Set<string>();
	for (const script of Object.values(scripts)) {
		const instance = world.create(script.layoutId);
		for (const call of script.calls) {
			instance.perform(call);
			for (const predicateId of Object.keys(world.predicates)) {
				if (instance.test(predicateId)) observed.add(predicateId);
			}
		}
	}
	for (const predicateId of Object.keys(world.predicates)) {
		if (!observed.has(predicateId)) {
			issues.push({
				check: 'world.predicate-reachable',
				message: `predicate "${predicateId}" was never observed true by any fixture script`
			});
		}
	}
}

function checkSchemaAgreement(
	definition: WorldActionDefinition,
	args: unknown,
	issues: ConformanceIssue[],
	expectValid: boolean
): void {
	let validate;
	try {
		validate = ajv.compile(definition.parameters);
	} catch (error) {
		issues.push({
			check: 'world.action-schema-valid',
			message: `"${definition.id}"'s parameters is not valid JSON Schema: ${describeError(error)}`
		});
		return;
	}
	const valid = validate(args);
	if (expectValid && !valid) {
		issues.push({
			check: 'world.action-schema-agrees',
			message: `"${definition.id}" rejected a legal call's own arguments against its advertised schema: ${ajv.errorsText(validate.errors)}`
		});
	}
}

function describeError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
