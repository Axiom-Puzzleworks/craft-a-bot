import { canonicalJson } from './schemas/cassette.js';
import { sha256Hex } from './schemas/sha256.js';
import type { PackManifest } from './schemas/pack-manifest.js';
import type { ToolDefinition } from './types/tool.js';

/**
 * **The pack content digest** (WP141, `110-CONTROL-SUITE-PLAN.md` §10;
 * `19-…` #30): a digest over what a pack tells a model and what it enforces
 * as data — every tool's and action's and sense's and service operation's
 * name, description and parameters, every goal card, policy card and stack in
 * full, and the id and description of every component, evaluator and reader
 * it ships. Code is not in it: a function cannot be digested portably, and a
 * changed function is a changed version, which `requiresPacks` already reads.
 * What it catches is the change the model reads — a tool description edited
 * to carry an instruction, a card loosened, a stack's fit removed — which is
 * the rug-pull a host pins against.
 */
export function packSurface(manifest: PackManifest): unknown {
	const described = (items: ReadonlyArray<{ id: string; description?: string }> | undefined) =>
		(items ?? []).map((item) => ({ id: item.id, description: item.description ?? '' }));
	return {
		id: manifest.id,
		version: manifest.version,
		tools: (manifest.tools ?? []).map(toolSurface),
		worlds: (manifest.worlds ?? []).map((world) => ({
			id: world.id,
			name: world.name,
			actions: world.actions.map((action) => ({
				id: action.id,
				name: action.name,
				description: action.description,
				parameters: action.parameters
			})),
			senses: world.senses.map((sense) => ({
				id: sense.id,
				name: sense.name,
				description: sense.description
			})),
			predicates: world.predicates
		})),
		serviceLines: (manifest.serviceLines ?? []).map((line) => ({
			id: line.id,
			name: line.name,
			description: line.description,
			operations: line.operations.map((operation) => ({
				id: operation.id,
				name: operation.name,
				description: operation.description,
				parameters: operation.parameters ?? null,
				riskTier: operation.riskTier
			}))
		})),
		goalCards: manifest.goalCards ?? [],
		policyCards: manifest.policyCards ?? [],
		stacks: manifest.stacks ?? [],
		guardrailComponents: described(manifest.guardrailComponents),
		evaluators: described(manifest.evaluators),
		readers: described(manifest.readers)
	};
}

/** What a model is told about one tool: the part a poisoned description changes. */
function toolSurface(tool: ToolDefinition): unknown {
	return {
		id: tool.id,
		name: tool.name,
		description: tool.description,
		parameters: tool.parameters,
		requiresNotebook: tool.requiresNotebook === true
	};
}

/** The pack's content digest: SHA-256 over the canonical JSON of its surface. */
export function packDigest(manifest: PackManifest): string {
	return sha256Hex(canonicalJson(packSurface(manifest)));
}

/** One tool description's digest, for a host that pins a single tool. */
export function toolDescriptionDigest(tool: ToolDefinition): string {
	return sha256Hex(canonicalJson(toolSurface(tool)));
}
