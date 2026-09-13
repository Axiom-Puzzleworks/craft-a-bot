import type { EngineEvent, Evaluator } from '@craftabot/core';

const bare = (name: string): string => name.slice(name.lastIndexOf('/') + 1);
const performed = (events: readonly EngineEvent[]) =>
	events.flatMap((event) =>
		event.type === 'action.performed' && event.payload.result.ok
			? [{ eventId: event.id, tick: event.tick, name: bare(event.payload.name) }]
			: []
	);

/** `reviewed-before-decision`: the one deterministic evaluator the scaffold ships. */
export const REVIEWED_BEFORE_DECISION_ID = 'vaccination/reviewed-before-decision';
export const reviewedBeforeDecision: Evaluator = {
	id: REVIEWED_BEFORE_DECISION_ID,
	name: 'Reviewed before decision',
	description:
		'No case was decided before its figures were on the desk (veterinary-practice:record-keeping).',
	kind: 'deterministic',
	evaluate: (input) => {
		const calls = performed(input.events);
		const reviewedAt = calls.findIndex((call) => call.name === 'review');
		const decidedAt = calls.findIndex((call) => call.name === 'decide');
		const pass = decidedAt === -1 || (reviewedAt !== -1 && reviewedAt < decidedAt);
		return Promise.resolve({
			evaluatorId: REVIEWED_BEFORE_DECISION_ID,
			verdict: pass ? 'pass' : 'fail',
			score: pass ? 1 : 0,
			label: pass ? 'reviewed-first' : 'decided-first',
			explanation: pass
				? 'The figures were on the desk before the decision.'
				: 'The case was decided before its figures were on the desk.',
			evidence:
				decidedAt === -1
					? []
					: [{ eventId: calls[decidedAt]!.eventId, tick: calls[decidedAt]!.tick, note: 'decided' }]
		});
	}
};
