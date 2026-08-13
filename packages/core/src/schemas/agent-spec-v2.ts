import { z } from 'zod';
import { SLOT_IDS } from '../types/brick.js';
import {
	actionsBrickSchema,
	agentSpecSchema,
	llmBrickSchema,
	memoryBrickSchema,
	safetyBrickSchema,
	senseBrickSchema,
	toolsBrickSchema,
	type AgentSpec
} from './agent-spec.js';

/**
 * **`AgentSpec` v2** (`14-…` §2.2, WP14) — a bot as a *list of fitted bricks*
 * rather than a fixed six-key object.
 *
 * v1's `bricks` was `{ llm?, memory?, tools?, sense?, actions?, safety? }`,
 * which said two things that are no longer true: that there are exactly six
 * kinds of brick, and that core knows what all of them are. Both are the
 * taxonomy-not-extension-point problem (`12-…` D11) written into the data
 * format, so no amount of registry work fixes it while the spec looks like
 * that.
 *
 * v2 says instead: here are the bricks fitted to this chassis, each naming the
 * socket it sits in, the kind it is, and its own config at its own version.
 * Core validates the envelope; the *kind* validates the config, because the
 * kind is the only thing that knows what its config means.
 *
 * The array also quietly permits what the professional mode will want later —
 * two equipment bricks, a second safety socket for a Monitor — while V1 keeps
 * the teaching-aid rule of one brick per slot (`14-…` §2.3).
 */

/** One brick, as fitted to a chassis. */
export const fittedBrickSchema = z.object({
	slot: z.enum(SLOT_IDS),
	/** The registered kind, qualified: `starter/llm`, `expansion/monitor`. */
	kind: z.string().min(1),
	/**
	 * The version of *the kind's* config schema this config was written
	 * against. Stored per brick, not per spec, because kinds version
	 * independently: a pack may ship a v3 Planner long after the starter
	 * bricks settled at v1.
	 */
	configVersion: z.number().int().positive(),
	/** Opaque to core; the kind's own `configSchema` is what validates it. */
	config: z.record(z.string(), z.unknown())
});
export type FittedBrick = z.infer<typeof fittedBrickSchema>;

/**
 * Who this bot is, as distinct from what it is built from (`14-…` §2.2, §6).
 *
 * `boxArtSeed` has lived on `AgentRecord` — the storage row — which meant a
 * bot exported to a kit file and imported somewhere else arrived looking like
 * a different bot. Identity belongs to the agent, not to the shelf it happened
 * to be sitting on, and multi-agent (`14-…` §6) needs it addressable.
 */
export const agentIdentitySchema = z.object({
	displayName: z.string().min(1),
	boxArtSeed: z.string()
});
export type AgentIdentity = z.infer<typeof agentIdentitySchema>;

export const agentSpecV2Schema = z.object({
	id: z.string().uuid(),
	name: z.string().min(1),
	schemaVersion: z.literal(2),
	bricks: z.array(fittedBrickSchema),
	goalCardId: z.string().min(1),
	/**
	 * The goal the user wrote on the Free Play card.
	 *
	 * Carried in v1 too, and never read by anything (`12-…` D10): the play
	 * screen showed it back and the bot was never told. It stays optional here
	 * — cards with a fixed goal ignore it — and the prompt starts honouring it
	 * when the engine moves onto v2.
	 */
	customGoalText: z.string().optional(),
	identity: agentIdentitySchema,
	createdAt: z.string().datetime(),
	updatedAt: z.string().datetime()
});
export type AgentSpecV2 = z.infer<typeof agentSpecV2Schema>;

export function parseAgentSpecV2(value: unknown): AgentSpecV2 {
	return agentSpecV2Schema.parse(value);
}

export function safeParseAgentSpecV2(
	value: unknown
): ReturnType<typeof agentSpecV2Schema.safeParse> {
	return agentSpecV2Schema.safeParse(value);
}

/**
 * Which socket each of v1's fixed keys corresponds to, and which kind it was.
 *
 * Naming starter ids inside core looks like a layering violation and is not:
 * v1 *could only ever* hold the six starter bricks, because the key names were
 * baked into the schema. The migration is describing history, not expressing a
 * dependency — and it is the last place in core that will ever mention them.
 */
const V1_BRICKS = {
	llm: { slot: 'brain', kind: 'starter/llm' },
	memory: { slot: 'memory', kind: 'starter/memory' },
	tools: { slot: 'equipment', kind: 'starter/tools' },
	sense: { slot: 'perception', kind: 'starter/sense' },
	actions: { slot: 'mobility', kind: 'starter/actions' },
	safety: { slot: 'safety', kind: 'starter/safety' }
} as const;

/** The order bricks are written in, so a migrated spec is byte-stable. */
const V1_ORDER = ['llm', 'memory', 'tools', 'sense', 'actions', 'safety'] as const;

export interface SpecMigrationError {
	kind: 'migration-error';
	message: string;
	detectedVersion?: unknown;
}

type SpecMigration = (raw: Record<string, unknown>) => AgentSpecV2 | SpecMigrationError;

/**
 * v1 → v2. Mechanical, as `14-…` §2.2 promises: each fixed key that is present
 * becomes an array entry, in a fixed order so the result is reproducible.
 *
 * `identity` is the one thing v1 has no answer for. `displayName` takes the
 * bot's name, which is what it was always displaying; `boxArtSeed` is left
 * empty rather than invented, because a made-up seed would silently change
 * what an existing bot looks like — and the storage row's seed is still the
 * live one until the workbench moves across.
 */
function migrateV1ToV2(raw: Record<string, unknown>): AgentSpecV2 | SpecMigrationError {
	const v1 = agentSpecSchema.safeParse(raw);
	if (!v1.success) {
		return {
			kind: 'migration-error',
			message: `spec failed v1 validation: ${v1.error.message}`
		};
	}

	const spec: AgentSpec = v1.data;
	const bricks = V1_ORDER.flatMap((key) => {
		const config = spec.bricks[key];
		if (config === undefined) return [];
		return [
			{
				slot: V1_BRICKS[key].slot,
				kind: V1_BRICKS[key].kind,
				configVersion: 1,
				config: config as Record<string, unknown>
			}
		];
	});

	const candidate = {
		id: spec.id,
		name: spec.name,
		schemaVersion: 2,
		bricks,
		goalCardId: spec.goalCardId,
		...(spec.customGoalText !== undefined ? { customGoalText: spec.customGoalText } : {}),
		identity: { displayName: spec.name, boxArtSeed: '' },
		createdAt: spec.createdAt,
		updatedAt: spec.updatedAt
	};

	const result = agentSpecV2Schema.safeParse(candidate);
	if (result.success) return result.data;
	return {
		kind: 'migration-error',
		message: `spec failed v2 validation after migration: ${result.error.message}`
	};
}

/** Table-driven by `schemaVersion`, exactly as kit files and traces are (07 §6). */
const specMigrations: Record<number, SpecMigration> = {
	1: migrateV1ToV2,
	2: (raw) => {
		const result = agentSpecV2Schema.safeParse(raw);
		if (result.success) return result.data;
		return {
			kind: 'migration-error',
			message: `spec failed v2 validation: ${result.error.message}`
		};
	}
};

export function migrateAgentSpec(value: unknown): AgentSpecV2 | SpecMigrationError {
	if (typeof value !== 'object' || value === null) {
		return { kind: 'migration-error', message: 'an agent spec must be a JSON object' };
	}
	const raw = value as Record<string, unknown>;
	const version = raw['schemaVersion'];
	const migration = typeof version === 'number' ? specMigrations[version] : undefined;
	if (!migration) {
		const known = Object.keys(specMigrations).map(Number);
		const newest = Math.max(...known);
		const message =
			typeof version === 'number' && version > newest
				? `This bot is from a newer set! It needs bot format v${version}, and this workbench understands v${newest}.`
				: 'This does not look like a bot — it has no recognisable version.';
		return { kind: 'migration-error', message, detectedVersion: version };
	}
	return migration(raw);
}

/** The brick fitted to a socket, or nothing. V1's one-per-slot rule in one place. */
export function brickInSlot(spec: AgentSpecV2, slot: FittedBrick['slot']): FittedBrick | undefined {
	return spec.bricks.find((brick) => brick.slot === slot);
}

/** Either shape, for the transition. */
export type AnyAgentSpec = AgentSpec | AgentSpecV2;

/**
 * Normalise whichever shape arrived into v2.
 *
 * Consumers take `AnyAgentSpec` and call this first, so a v1 spec from
 * somebody's shelf and a v2 spec from a fresh build reach the same code. That
 * is what lets the system understand v2 everywhere *before* anything is
 * required to write it — the alternative being one atomic change across the
 * engine, governance, both packs and the workbench, with nothing working in
 * between.
 */
export function toSpecV2(spec: AnyAgentSpec): AgentSpecV2 {
	if (spec.schemaVersion === 2) return spec;
	const migrated = migrateAgentSpec(spec);
	if ('kind' in migrated) {
		throw new Error(`This bot could not be read: ${migrated.message}`);
	}
	return migrated;
}

/** Which v1 key each socket corresponds to — the mirror of `V1_BRICKS`. */
const LEGACY_KEY_BY_SLOT = {
	brain: 'llm',
	memory: 'memory',
	equipment: 'tools',
	perception: 'sense',
	mobility: 'actions',
	safety: 'safety'
} as const satisfies Record<FittedBrick['slot'], keyof AgentSpec['bricks']>;

const LEGACY_SCHEMA_BY_SLOT = {
	brain: llmBrickSchema,
	memory: memoryBrickSchema,
	equipment: toolsBrickSchema,
	perception: senseBrickSchema,
	mobility: actionsBrickSchema,
	safety: safetyBrickSchema
} as const;

/**
 * A v2 spec seen through v1's six-key window — **a transition shim**.
 *
 * Everything that reads a spec today thinks in six fixed bricks. Rewriting all
 * of it in one change is how a migration ends up half-done, so instead each
 * consumer normalises to v2 and then looks through this window, which makes
 * the diff a rename rather than a rewrite. Slice 3 deletes it: once bricks
 * contribute through their runtimes, nothing needs to know that "the thing in
 * the brain socket" was once called `llm`.
 *
 * Selection is by **socket, then shape**. A brick only appears in the window
 * if its config actually parses as the v1 config for that slot — so a Monitor
 * brick sitting in the safety socket is skipped rather than handed to code
 * that would read it as a Safety brick and misunderstand every field.
 */
export function legacyBricks(spec: AgentSpecV2): AgentSpec['bricks'] {
	const bricks: Record<string, unknown> = {};
	for (const brick of spec.bricks) {
		const key = LEGACY_KEY_BY_SLOT[brick.slot];
		if (bricks[key] !== undefined) continue; // one per slot; first wins
		const parsed = LEGACY_SCHEMA_BY_SLOT[brick.slot].safeParse(brick.config);
		if (parsed.success) bricks[key] = parsed.data;
	}
	return bricks as AgentSpec['bricks'];
}

/** The whole spec through that window, for consumers not yet ported. */
export function asLegacySpec(spec: AnyAgentSpec): AgentSpec {
	const v2 = toSpecV2(spec);
	return {
		id: v2.id,
		name: v2.name,
		bricks: legacyBricks(v2),
		goalCardId: v2.goalCardId,
		...(v2.customGoalText !== undefined ? { customGoalText: v2.customGoalText } : {}),
		createdAt: v2.createdAt,
		updatedAt: v2.updatedAt,
		schemaVersion: 1
	};
}
