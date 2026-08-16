import { migrateBrickConfig } from './brick-config.js';
import type { PackRegistry } from './pack-registry.js';
import type { AgentSpecV2 } from './schemas/agent-spec-v2.js';
import type { BuildProblem } from './schemas/build-problem.js';
import type { SlotId } from './types/brick.js';

/**
 * **Generic build checks for spec v2** (`14-…` §2.1, WP14).
 *
 * The line that matters in the contract: *"`validateSpec` gains one generic
 * check — config parses against the kind's schema at its version — replacing
 * per-brick special cases."*
 *
 * The v1 validator knows the six bricks by name. It asks whether the LLM brick
 * has a cartridge, whether the tools brick names installed tools, whether the
 * sense brick names installed channels — six bespoke checks that a seventh
 * brick could never join. That is D11 again, this time in the validator: a
 * Planner brick from an expansion pack would be silently unvalidated, because
 * core would have nothing to say about a shape it has never seen.
 *
 * Here core asks three questions it can ask about *any* brick, and delegates
 * the fourth — is this config legal? — to the kind that defined it:
 *
 *  1. is the kind installed?
 *  2. does its config parse against that kind's schema?
 *  3. is anything fitted twice to one socket?
 *
 * The goal-card and cartridge checks used to live in a second, v1-shaped half
 * of `validateSpec`. Slice 3d retired that half: the cartridge is read through
 * the brain slot contract, everything a brick *offers* is checked from its
 * contributions, and anything left is delegated to the kind via
 * `validateConfig`. Every check `validateSpec` runs is now generic.
 */

/** V1's rule, kept for the teaching aid: one brick per socket (`14-…` §2.3). */
const ONE_PER_SLOT = true;

export function validateSpecV2(spec: AgentSpecV2, registry: PackRegistry): BuildProblem[] {
	const problems: BuildProblem[] = [];
	const filled = new Set<SlotId>();

	for (const brick of spec.bricks) {
		if (ONE_PER_SLOT && filled.has(brick.slot)) {
			problems.push({
				code: 'slot-already-filled',
				severity: 'blocking',
				message: `There are two bricks in the ${brick.slot} socket, and only one will fit.`,
				details: { slot: brick.slot, kind: brick.kind }
			});
		}
		filled.add(brick.slot);

		const kind = registry.getBrickKind(brick.kind);
		if (!kind) {
			// The shape a kit file takes when it was built with a pack you have
			// not got. Blocking, because the bot genuinely cannot be assembled —
			// and named precisely, so the message can say which pack is missing.
			problems.push({
				code: 'unknown-brick-kind',
				severity: 'blocking',
				message: `This bot has a brick this workbench does not have: "${brick.kind}".`,
				details: { kind: brick.kind, slot: brick.slot }
			});
			continue;
		}

		if (kind.slot !== brick.slot) {
			problems.push({
				code: 'bad-brick-config',
				severity: 'blocking',
				message: `A ${kind.name} does not go in the ${brick.slot} socket.`,
				details: { kind: brick.kind, expected: kind.slot, found: brick.slot }
			});
			continue;
		}

		/*
		 * The one generic check. Note what core is *not* doing: it does not know
		 * what a window size or a temperature is, and never will. It hands the
		 * config to the schema the kind registered and reports what comes back.
		 */
		const migrated = migrateBrickConfig(brick.config, brick.configVersion, kind);
		const parsed = kind.configSchema.safeParse(migrated);
		if (!parsed.success) {
			problems.push({
				code: 'bad-brick-config',
				severity: 'blocking',
				message: `The ${kind.name} is set up in a way it does not understand.`,
				details: {
					kind: brick.kind,
					issues: parsed.error.issues.map((issue) => ({
						path: issue.path.join('.'),
						message: issue.message
					}))
				}
			});
			continue;
		}

		if (brick.configVersion > kind.configVersion) {
			// A config from a newer version of the same pack. Not blocking: the
			// config parsed, so the brick works; it may simply be missing
			// something the newer version added.
			problems.push({
				code: 'bad-brick-config',
				severity: 'warning',
				message: `The ${kind.name} was set up by a newer version of its pack.`,
				details: {
					kind: brick.kind,
					specVersion: brick.configVersion,
					installedVersion: kind.configVersion
				}
			});
		}
	}

	return problems;
}
