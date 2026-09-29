import {
	toSpecV2,
	type AgentSpecV2,
	type AnyAgentSpec,
	type WorldDefinition
} from '@craftabot/core';

/** `fs-servicing/sight` → `sight`. */
const bare = (id: string): string => id.slice(id.lastIndexOf('/') + 1);

/** The ids of `offered` whose bare name the bot had `fitted`; every one of `offered` when none carries over. */
function carriedOver(fitted: readonly string[], offered: readonly string[]): string[] {
	const wanted = new Set(fitted.map(bare));
	const kept = offered.filter((id) => wanted.has(bare(id)));
	return kept.length > 0 ? kept : [...offered];
}

/**
 * **A bot moved onto a world** (WP112; `90-…` §7's one-spec-per-run seam):
 * the same bot — its brain, memory, safety, everything — with the
 * starter's Sense and Actions bricks re-pointed at what the world offers.
 * Whatever channels and actions the bot had that the world also offers (by
 * bare id) are kept; when none carry over, it gets everything the world
 * offers, so a bot moved to a desk is never deaf there. The bench does the
 * same when a card changes world (D20, `12-…`); this is that rule for a host
 * with no bench — a followed handoff, a bank day with one kit.
 */
export function specOnWorld(
	spec: AnyAgentSpec,
	world: Pick<WorldDefinition, 'senses' | 'actions'>
): AgentSpecV2 {
	const v2 = toSpecV2(spec);
	return {
		...v2,
		bricks: v2.bricks.map((brick) => {
			if (brick.kind === 'starter/sense') {
				const channels = (brick.config as { channels?: string[] }).channels ?? [];
				return {
					...brick,
					config: {
						...brick.config,
						channels: carriedOver(
							channels,
							world.senses.map((sense) => sense.id)
						)
					}
				};
			}
			if (brick.kind === 'starter/actions') {
				const enabled = (brick.config as { enabled?: string[] }).enabled ?? [];
				return {
					...brick,
					config: {
						...brick.config,
						enabled: carriedOver(
							enabled,
							world.actions.map((action) => action.id)
						)
					}
				};
			}
			return brick;
		})
	};
}
