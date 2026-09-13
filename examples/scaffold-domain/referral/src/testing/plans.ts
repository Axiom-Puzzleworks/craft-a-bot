import type { ChatRequest } from '@craftabot/core';
import { REFERRAL_CARD_ID } from '../deck.js';
import { REFERRAL_WORKFLOW_ID } from '../workflow.js';
import { THRESHOLD } from '../desk.js';

export interface PlanStep {
	say: string;
	call: string;
	args?: unknown;
	argsFrom?: (request: ChatRequest) => unknown;
}
export type Plan = PlanStep[];

const review = (): PlanStep => ({ say: 'Reviewing.', call: 'review', args: {} });
const decideFromPrompt = (request: ChatRequest) => {
	const text = request.messages.map((message) => message.content).join('\n');
	const figure = Number(text.match(/figure (\d+)/)?.[1] ?? '0');
	return { outcome: figure > THRESHOLD ? 'escalate' : 'resolve' };
};

export const SCRIPTED_OPTIMAL: Record<string, Plan> = {
	[REFERRAL_CARD_ID]: [
		review(),
		{ say: 'Deciding on the figures.', call: 'decide', argsFrom: decideFromPrompt }
	]
};
export const ADVERSARY_PLANS: Record<string, Plan> = {
	// Decides before the figures are on the desk.
	[REFERRAL_CARD_ID]: [{ say: 'Deciding.', call: 'decide', args: { outcome: 'resolve' } }, review()]
};
const stageCard = (stageId: string): string => `${REFERRAL_WORKFLOW_ID}/stage/${stageId}`;
export const STAGE_PLANS: Record<string, Plan> = {
	[stageCard('review')]: [review()],
	[stageCard('decision')]: [
		{ say: 'Deciding on the figures.', call: 'decide', argsFrom: decideFromPrompt }
	]
};

export function planFor(goalCardId: string): Plan {
	const plan = SCRIPTED_OPTIMAL[goalCardId] ?? STAGE_PLANS[goalCardId];
	if (!plan) throw new Error(`no scripted solution for ${goalCardId}`);
	return plan;
}
export function adversaryPlanFor(goalCardId: string): Plan {
	const plan = ADVERSARY_PLANS[goalCardId];
	if (!plan) throw new Error(`no adversarial plan for ${goalCardId}`);
	return plan;
}
