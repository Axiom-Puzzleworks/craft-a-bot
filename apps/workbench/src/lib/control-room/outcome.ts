import type { RunOutcome } from '@craftabot/core';
import type { Status } from './dataviz.js';

/**
 * **A run outcome as a lamp** (`60-CONTROL-ROOM-V2.md` §4.1, WP71): the one
 * mapping every outcome lamp in the Workshop reads. Success passes; a run
 * still going is live; a stop by a guardrail or a person is inconclusive —
 * the run did not fail, it was stopped; everything else (an error, a loop,
 * a failure) fails. The word beside the lamp is the outcome itself.
 */
export function statusOfOutcome(outcome: RunOutcome | string | undefined): Status {
	switch (outcome) {
		case 'SUCCESS':
			return 'pass';
		case 'IN_PROGRESS':
			return 'live';
		case 'STOPPED_BY_GUARDRAIL':
		case 'STOPPED_BY_USER':
			return 'inconclusive';
		default:
			return 'fail';
	}
}
