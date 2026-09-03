/**
 * The persistence seam moved into `@craftabot/core` (WP36 stage A,
 * `26-TARGET-DESIGN-V3.md` §6.7) so a headless host can store runs against the
 * same contract the browser does. This module keeps the old path alive for one
 * release; new code imports from `@craftabot/core` directly.
 */
export {
	DEFAULT_RUN_CAP,
	byNewestCreated,
	byNewestFirst,
	emptyQuarantine,
	selectRunsToEvict,
	type QuarantineReport,
	type Storage
} from '@craftabot/core';
