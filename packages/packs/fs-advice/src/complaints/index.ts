/** The complaints desk (WP72, `61-LAST-DECKS.md` §4.2): the Advice Desk pack's second purpose. */
export {
	COMPLAINT_KINDS,
	complaintCase,
	profileOfComplaint,
	type ComplaintCase,
	type ComplaintKind
} from './cases.js';
export {
	COMPLAINTS_DESK_WORLD_ID,
	complaintsDesk,
	complaintsDeskSpec,
	complaintsLayouts,
	qualifyComplaintsId,
	type ComplaintsDeskState
} from './desk.js';
export {
	ACK_TICKS,
	FINAL_TICKS,
	ROOT_CAUSES,
	mark,
	unmark,
	type ComplaintsExtra,
	type ComplaintsState,
	type RootCause
} from './extra.js';
export { complaintCardId, complaintsGoalCards } from './goal-cards.js';
export {
	COMPLAINTS_DECK,
	COMPLAINT_ACKNOWLEDGED_ID,
	REDRESS_WITHIN_BOUNDS_ID,
	ROOT_CAUSE_NAMED_ID,
	complaintsScenarios,
	type ComplaintsScenario
} from './scenarios.js';
export {
	complaintAcknowledged,
	complaintsEvaluators,
	redressWithinBounds,
	rootCauseNamed
} from './evaluators.js';
export { complaintsStrings } from './strings.js';
export {
	COMPLAINTS_CEILINGS,
	COMPLAINTS_CONFIGURATIONS,
	COMPLAINTS_STAGES,
	COMPLAINTS_WORKFLOW_ID,
	DEFAULT_REDRESS_LIMIT,
	UPHELD_CATEGORIES,
	complaintsBookFor,
	complaintsDecisionKind,
	complaintsWorkflow,
	fairRedressOf,
	rootCauseOf,
	upheldByTheRegister,
	type ComplaintsConfigurationId
} from './workflow.js';
export { WORK_ITEM_LAYOUT as COMPLAINTS_WORK_ITEM_LAYOUT } from './desk.js';
export { complaintCaseFromItem, kindForCategory } from './cases.js';
