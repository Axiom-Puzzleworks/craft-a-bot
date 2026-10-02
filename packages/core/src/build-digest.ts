import { canonicalJson } from './schemas/cassette.js';
import { sha256Hex } from './schemas/sha256.js';
import { toSpecV2, type AnyAgentSpec } from './schemas/agent-spec-v2.js';

/**
 * **The build digest** (WP147, `110-CONTROL-SUITE-PLAN.md` §10; PRA SS1/23
 * principle 3's change control): SHA-256 over what makes a bot behave as it
 * does — the goal card and its dial (the knobs), and every fitted brick's
 * kind, config and config version, which carries the cartridge, the
 * personality (the prompt), the Safety brick and its stack. Its id, name and
 * timestamps are not in it: renaming a bot does not change it, and swapping
 * its cartridge does. A host that records the digest a build was validated
 * at can say, on `run.started.changed`, when a run is not that build.
 */
export function buildDigest(spec: AnyAgentSpec): string {
	const v2 = toSpecV2(spec);
	return sha256Hex(
		canonicalJson({
			goalCardId: v2.goalCardId,
			goalDial: v2.goalDial ?? null,
			bricks: v2.bricks.map((brick) => ({
				slot: brick.slot,
				kind: brick.kind,
				configVersion: brick.configVersion,
				config: brick.config
			}))
		})
	);
}
