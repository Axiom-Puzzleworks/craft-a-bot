import { z } from 'zod';
import { SLOT_IDS } from '../types/brick.js';

/**
 * validateSpec()'s output (02-AGENT-MODEL.md §6). Rendered by the build-checks
 * ribbon (03-UI-UX-DESIGN.md §4.4): only `blocking` problems disable GO,
 * everything else explains without blocking.
 *
 * Zod-first since WP4: `AgentRecord.lastValidation` embeds these, so they cross
 * the storage boundary and must be validated on the way back in
 * (10-CODING-STANDARDS.md §1).
 */

export const buildProblemSeveritySchema = z.enum(['blocking', 'warning']);
export type BuildProblemSeverity = z.infer<typeof buildProblemSeveritySchema>;

export const buildProblemCodeSchema = z.enum([
	'missing-brain',
	'unknown-cartridge',
	'unknown-goal-card',
	'unknown-tool',
	'unknown-sense-channel',
	'unknown-action',
	'unknown-blocked-action',
	'tool-needs-notebook',
	/**
	 * Spec v2, from the open brick contract (`14-…` §2.1, WP14).
	 *
	 * `unknown-brick-kind` — the spec names a kind no installed pack provides,
	 * which is what a kit file from someone with an expansion pack you have not
	 * got looks like. `bad-brick-config` — the kind is installed but its config
	 * does not parse against that kind's schema. One generic check each,
	 * replacing the per-brick special cases core used to carry.
	 */
	'unknown-brick-kind',
	'bad-brick-config',
	/** Two bricks fitted to one socket, which V1's teaching-aid rule forbids. */
	'slot-already-filled',
	/** A policy card id (`14-…` §4.6, WP22) no installed pack registered. */
	'unknown-policy-card',
	/** An If/Then rule's `then` names a tool or action nothing has installed. */
	'unknown-if-then-target',
	/** A Librarian brick's `books` names a book its own catalogue does not carry. */
	'unknown-book',
	/** A Connector brick's `serviceId` names a service its own catalogue does not carry. */
	'unknown-service',
	/** A Connector brick's `scopes` names an operation its configured service does not offer. */
	'unknown-scope',
	/**
	 * The Armour Brick's own four (`25-ARMOUR-BRICK.md` §4.3, WP35 stage D):
	 * a region this build does not recognise (never blocking — the schema
	 * accepts any string); a per-filter override of `block`/`ask` that clamps
	 * to `stop`/`note` outside `pre-act`; every screen off while not
	 * offline; and fitted but no `geap` credential while not offline.
	 */
	'unrecognised-armour-region',
	'clamped-armour-disposition',
	'armour-checks-nothing',
	'armour-not-plugged-in',
	/**
	 * The Guard Brick's own three (`29-GUARD-SHELL.md` §4.6, WP39 stage E):
	 * no service chosen; a service no installed pack ships; a service block
	 * that is not JSON. All warnings — the local floor still runs.
	 */
	'guard-no-service',
	'unknown-guard-service',
	'guard-service-config-not-json',
	/** The Monitor Judge's own three (WP43, `31-EVALUATORS.md` §4.3), all warnings. */
	'judge-no-evaluator',
	'unknown-evaluator',
	'judge-config-not-json',
	/** A scenario carrying injections met a world with no `inject()` (WP44, `32-SCENARIOS.md` §4.1). */
	'world-cannot-inject'
]);
export type BuildProblemCode = z.infer<typeof buildProblemCodeSchema>;

/**
 * V1's six brick names, as a problem could once point at them.
 *
 * > **Amended 2026-08-13 (WP14 slice 3d):** superseded by `slot`, and kept only
 * > so a stored `AgentRecord.lastValidation` written before this slice still
 * > parses. Nothing writes it any more. It cannot be *renamed* into `slot`,
 * > because the two vocabularies genuinely differ — `tools` is the equipment
 * > socket, `sense` the perception one — and a problem now points at the socket
 * > rather than at a brick core has heard of.
 */
export const brickSlotSchema = z.enum(['llm', 'memory', 'tools', 'sense', 'actions', 'safety']);
export type BrickSlot = z.infer<typeof brickSlotSchema>;

export const buildProblemSchema = z.object({
	code: buildProblemCodeSchema,
	severity: buildProblemSeveritySchema,
	/** @deprecated since WP14 slice 3d — read `slot`. */
	brick: brickSlotSchema.optional(),
	/**
	 * Which socket this is about, so the UI can point at the brick in it.
	 *
	 * A socket rather than a brick kind, deliberately: the problem the ribbon has
	 * to point at is *where on the chassis to look*, and a kind id would make
	 * "this socket is empty" unsayable — which is what `missing-brain` is.
	 */
	slot: z.enum(SLOT_IDS).optional(),
	message: z.string(),
	details: z.record(z.string(), z.unknown()).optional()
});
export type BuildProblem = z.infer<typeof buildProblemSchema>;
