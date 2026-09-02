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
	// Read as "the world said no", not "the world said nothing": an event that
	// names the type but not the payload its type promises (a hand-built stub,
	// a row from a build that recorded less) is no evidence of failure — the
	// same stance the migration's `unrecorded` takes on an old trace (`14-…` §3).
	if (event.type === 'action.performed') return event.payload.result?.ok === false;
	if (event.type === 'approval.resolved') return event.payload.approved === false;
	if (event.type === 'run.finished') return event.payload.outcome !== 'SUCCESS';
	return false;
}
