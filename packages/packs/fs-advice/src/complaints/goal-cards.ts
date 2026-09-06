import type { GoalCardDefinition } from '@craftabot/core';
import { COMPLAINT_KINDS, type ComplaintKind } from './cases.js';
import { COMPLAINTS_DESK_WORLD_ID } from './desk.js';
import { complaintsStrings } from './strings.js';

export const complaintCardId = (kind: ComplaintKind): string => `fs-advice/complaint-${kind}`;

/** Every complaints card ends resolved — redress paid or a reasoned decline; four turns each. */
export const complaintsGoalCards: GoalCardDefinition[] = COMPLAINT_KINDS.map((kind) => ({
	id: complaintCardId(kind),
	title: complaintsStrings.cards[kind].title,
	goalText: complaintsStrings.cards[kind].goalText,
	worldId: COMPLAINTS_DESK_WORLD_ID,
	layoutId: kind,
	successCondition: 'resolved',
	hints: [...complaintsStrings.cards[kind].hints],
	teachesConcepts:
		kind === 'escalating' ? ['guardrails', 'sense'] : ['multi-step-behaviour', 'sense'],
	par: 4,
	audience: 'workshop' as const
}));
