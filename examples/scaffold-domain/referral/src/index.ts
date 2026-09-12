import type { PackManifest } from '@craftabot/core';
import { REFERRAL_BASELINE_ID, referralBaseline } from './campaign.js';
import { REVIEW_BEFORE_DECIDING } from './card.js';
import { referralGoalCards, referralScenarios } from './deck.js';
import { referralDesk } from './desk.js';
import { reviewedBeforeDecision } from './evaluator.js';
import { referralWorkflow } from './workflow.js';

/**
 * @craftabot/pack-referral — **the Referral desk**, scaffolded by
 * `craftabot scaffold domain` (WP107). A journey pack: the desk, the card
 * and the deck, the policy card, the evaluator, the workflow with its book,
 * the campaign. Content only.
 */
export const referralPack: PackManifest = {
	id: 'referral',
	name: 'Referral desk (scaffolded)',
	version: '0.1.0',
	requiresCore: '>=1.0.0',
	requiresPacks: { 'vet-practice': '^0.1.0' },
	worlds: [referralDesk],
	goalCards: referralGoalCards,
	scenarios: referralScenarios,
	campaigns: [
		{
			id: REFERRAL_BASELINE_ID,
			title: 'The Referral desk baseline',
			description: 'Two scenarios, two guards, two brains, one seed.',
			campaign: () => referralBaseline()
		}
	],
	policyCards: [REVIEW_BEFORE_DECIDING],
	evaluators: [reviewedBeforeDecision],
	workflows: [referralWorkflow]
};

export default referralPack;
export {
	REFERRAL_DESK_WORLD_ID,
	THRESHOLD,
	WORK_ITEM_LAYOUT,
	referralCase,
	referralDesk,
	referralDeskSpec,
	verdictFor,
	type ReferralDeskState,
	type ReferralExtra
} from './desk.js';
export { REFERRAL_CARD_ID, referralGoalCards, referralScenarios } from './deck.js';
export { REVIEW_BEFORE_DECIDING } from './card.js';
export { REVIEWED_BEFORE_DECISION_ID, reviewedBeforeDecision } from './evaluator.js';
export { referralBook } from './book.js';
export { REFERRAL_BASELINE_ID, referralBaseline } from './campaign.js';
export {
	REFERRAL_CEILINGS,
	REFERRAL_CONFIGURATIONS,
	REFERRAL_WORKFLOW_ID,
	referralStages,
	referralWorkflow
} from './workflow.js';
