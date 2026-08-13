import { z } from 'zod';
import type { BrickKindDefinition } from '../types/brick.js';
import type { Guardrail, GuardrailHook } from '../types/guardrail.js';
import type { ToolDefinition } from '../types/tool.js';
import type { WorldDefinition } from '../types/world.js';

/**
 * Pack content (01-ARCHITECTURE.md §4). The pure-data content types
 * (bricks/tools/cartridges/goal cards) are Zod-first — they cross the pack
 * manifest / kit-file boundary. `WorldDefinition` (types/world.ts) and
 * `GuardrailDefinition` (below) embed factory functions Zod cannot validate
 * as data, so `PackManifest` itself stays a hand-written interface composing
 * both (10-CODING-STANDARDS.md §1).
 */

export const brickDefinitionSchema = z.object({
	id: z.string().min(1), // "starter/llm" — V1's five brick kinds are core-fixed; forward-looking for later kits
	kind: z.enum(['llm', 'memory', 'tools', 'sense', 'actions', 'safety']),
	/** The toy name, as moulded on the brick. */
	name: z.string().min(1),
	/** One-line whisper shown on hover in the parts tray (03-UI-UX-DESIGN.md §4.1). */
	description: z.string(),
	/**
	 * The flip side (00-PROJECT-OVERVIEW.md §6, 03 §4.3): every brick has a toy
	 * name *and* a "what this really is" explanation in plain adult technical
	 * language. The toy never hides the truth — it just keeps it one click away.
	 */
	realName: z.string().min(1),
	realExplanation: z.string().min(1)
});
export type BrickDefinition = z.infer<typeof brickDefinitionSchema>;

/**
 * The pure-data half of a tool. The executable half (`ToolDefinition`, which
 * adds `execute`) lives in types/tool.ts, because a function cannot be
 * validated as data — the same split as worlds and guardrails.
 */
export const toolMetadataSchema = z.object({
	id: z.string().min(1),
	name: z.string().min(1),
	description: z.string(),
	parameters: z.record(z.string(), z.unknown()), // JSON-schema
	/** e.g. notebook_read/notebook_write — declares the Memory-brick-notebook dependency (02-AGENT-MODEL.md §2.3). */
	requiresNotebook: z.boolean().optional()
});
export type ToolMetadata = z.infer<typeof toolMetadataSchema>;

const cartridgeStatSchema = z.union([z.literal(1), z.literal(2), z.literal(3)]);

export const cartridgeDefinitionSchema = z.object({
	id: z.string().min(1),
	providerId: z.string().min(1),
	model: z.string().min(1),
	displayName: z.string().min(1),
	blurb: z.string(),
	stats: z.object({
		words: cartridgeStatSchema,
		reasoning: cartridgeStatSchema,
		speed: cartridgeStatSchema
	}),
	costHint: z.enum(['low', 'medium', 'high']),
	defaults: z.object({
		temperature: z.number().min(0).max(2),
		maxTokens: z.number().int().positive()
	})
});
export type CartridgeDefinition = z.infer<typeof cartridgeDefinitionSchema>;

export const goalCardDefinitionSchema = z.object({
	id: z.string().min(1),
	title: z.string().min(1),
	goalText: z.string().min(1),
	worldId: z.string().min(1),
	layoutId: z.string().min(1),
	successCondition: z.string().min(1),
	hints: z.array(z.string()),
	teachesConcepts: z.array(z.string()),
	/**
	 * "About this many steps" — the length of a scripted-optimal solution
	 * (`16-…` §1.1). Two cards shipped in V1.0 could not be won inside the
	 * platform's 30-tick floor by any bot ever built, and nothing on the card
	 * said so (`12-…` C6). A card that states its par can be checked against
	 * the budget, by the player and by the L3 solvability suite alike.
	 *
	 * Optional: a card with no machine-checkable goal has no par, and every
	 * pack written before this field existed still validates.
	 */
	par: z.number().int().positive().optional(),
	/**
	 * Deliberately harder than the default budget allows, and labelled as such
	 * in the UI. Kept so the step-budget dial has a reason to exist.
	 */
	expert: z.boolean().optional()
});
export type GoalCardDefinition = z.infer<typeof goalCardDefinitionSchema>;

/** Pure-data manifest shell — enough to check kit-file `requires` compatibility without touching content. */
export const packManifestMetadataSchema = z.object({
	id: z.string().min(1),
	name: z.string().min(1),
	version: z.string().min(1),
	requiresCore: z.string().min(1)
});
export type PackManifestMetadata = z.infer<typeof packManifestMetadataSchema>;

/** A pack-contributed guardrail (08-GOVERNANCE-GUARDRAILS.md §5 "policy cards" era generalises this). */
export interface GuardrailDefinition {
	id: string;
	name: string;
	description: string;
	hooks: GuardrailHook[];
	create(config?: unknown): Guardrail;
}

export interface PackArtwork {
	boxArt?: string;
	brickSprites?: Record<string, string>;
}

export interface PackManifest extends PackManifestMetadata {
	bricks?: BrickDefinition[];
	/**
	 * Brick *kinds* — the open contract (`14-…` §2, WP14).
	 *
	 * `bricks` above is the pure-data half that has always existed: the toy
	 * name, the real name, the explanation. `brickKinds` is what makes a brick
	 * an extension point rather than a taxonomy — it adds the config schema,
	 * its version and migrations, the defaults a freshly-snapped brick gets,
	 * and the runtime the loop calls into.
	 *
	 * Separate rather than merged, for now, because the six V1 bricks are
	 * referenced by `kind` in spec v1 and by `id` in spec v2; the two coexist
	 * until the spec migration lands.
	 */
	brickKinds?: BrickKindDefinition[];
	tools?: ToolDefinition[];
	worlds?: WorldDefinition[];
	cartridges?: CartridgeDefinition[];
	goalCards?: GoalCardDefinition[];
	guardrails?: GuardrailDefinition[];
	artwork?: PackArtwork;
}
