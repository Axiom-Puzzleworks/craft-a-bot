import type { EngineEvent } from '@craftabot/core';

/**
 * What "went wrong" means, in one place.
 *
 * Deliberately broader than `error`: a refused action and a tripped guardrail
 * are both things a practitioner scanning for trouble wants a filter to catch,
 * and neither is an error in the engine's sense. A guardrail trip is *the
 * system working* — but it is still the row you were looking for.
 *
 * Lived in the workbench's timeline module until WP36 stage B
 * (`26-TARGET-DESIGN-V3.md` §6.14); the incident log and the safety case both
 * derive from it, so it moved here with them. The timeline still uses it —
 * through this export.
 */
export function isFailure(event: EngineEvent): boolean {
	if (event.type === 'error') return true;
	if (event.type === 'guardrail.tripped') return true;
	if (event.type === 'action.performed') return !event.payload.result.ok;
	if (event.type === 'approval.resolved') return !event.payload.approved;
	if (event.type === 'run.finished') return event.payload.outcome !== 'SUCCESS';
	return false;
}
