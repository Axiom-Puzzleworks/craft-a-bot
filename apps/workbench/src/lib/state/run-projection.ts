/**
 * The one trace→state fold moved into `@craftabot/core` (WP36 stage B,
 * `26-TARGET-DESIGN-V3.md` §6.14) so a headless host replays a trace exactly
 * as the Playroom and the Run Lab do. Re-exported here for one release; new
 * code imports from `@craftabot/core`.
 */
export {
	applyEvent,
	emptyProjection,
	projectThrough,
	type PendingApproval,
	type RunProjection
} from '@craftabot/core';
