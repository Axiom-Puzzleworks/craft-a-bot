import type { PackManifest } from '@craftabot/core';
import { VACCINATION_BASELINE_ID, vaccinationBaseline } from './campaign.js';
import { REVIEW_BEFORE_DECIDING } from './card.js';
import { vaccinationGoalCards, vaccinationScenarios } from './deck.js';
import { vaccinationDesk } from './desk.js';
import { reviewedBeforeDecision } from './evaluator.js';
import { vaccinationWorkflow } from './workflow.js';

/**
 * @craftabot/pack-vaccination — **the Vaccination desk**, scaffolded by
 * `craftabot scaffold domain` (WP107). A journey pack: the desk, the card
 * and the deck, the policy card, the evaluator, the workflow with its book,
 * the campaign. Content only.
 */
export const vaccinationPack: PackManifest = {
	id: 'vaccination',
	name: 'Vaccination desk (scaffolded)',
	version: '0.1.0',
	requiresCore: '>=1.0.0',
	requiresPacks: { 'vet-practice': '^0.1.0' },
	worlds: [vaccinationDesk],
	goalCards: vaccinationGoalCards,
	scenarios: vaccinationScenarios,
	campaigns: [
		{
			id: VACCINATION_BASELINE_ID,
			title: 'The Vaccination desk baseline',
			description: 'Two scenarios, two guards, two brains, one seed.',
			campaign: () => vaccinationBaseline()
		}
	],
	policyCards: [REVIEW_BEFORE_DECIDING],
	evaluators: [reviewedBeforeDecision],
	workflows: [vaccinationWorkflow]
};

export default vaccinationPack;
export {
	VACCINATION_DESK_WORLD_ID,
	THRESHOLD,
	WORK_ITEM_LAYOUT,
	vaccinationCase,
	vaccinationDesk,
	vaccinationDeskSpec,
	verdictFor,
	type VaccinationDeskState,
	type VaccinationExtra
} from './desk.js';
export { VACCINATION_CARD_ID, vaccinationGoalCards, vaccinationScenarios } from './deck.js';
export { REVIEW_BEFORE_DECIDING } from './card.js';
export { REVIEWED_BEFORE_DECISION_ID, reviewedBeforeDecision } from './evaluator.js';
export { vaccinationBook } from './book.js';
export { VACCINATION_BASELINE_ID, vaccinationBaseline } from './campaign.js';
export {
	VACCINATION_CEILINGS,
	VACCINATION_CONFIGURATIONS,
	VACCINATION_WORKFLOW_ID,
	vaccinationStages,
	vaccinationWorkflow
} from './workflow.js';
