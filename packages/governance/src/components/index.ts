/**
 * **The adapters** (WP94, `85-COMPONENTS.md` §5): the factories the packs
 * register as components. `governance` is not a pack; each lane's pack ships
 * its components in its manifest — `starter` the built-ins, the policy card
 * and the egress rules; each service pack its service's; `monitor` the
 * evaluator breaker.
 */
export {
	ACTION_BLOCKLIST_COMPONENT_ID,
	APPROVAL_MODE_COMPONENT_ID,
	NO_REPETITION_COMPONENT_ID,
	STEP_BUDGET_COMPONENT_ID,
	TOKEN_BUDGET_COMPONENT_ID,
	actionBlocklistComponent,
	approvalModeComponent,
	builtinComponents,
	builtinFitsFor,
	noDeps,
	noRepetitionComponent,
	stepBudgetComponent,
	tokenBudgetComponent
} from './builtin.js';
export { POLICY_CARD_COMPONENT_ID, policyCardComponent } from './policy-card.js';
export {
	GUARD_BRICK_ID_PREFIX,
	guardServiceComponent,
	guardServiceComponentSchema,
	type GuardServiceComponentConfig,
	type GuardServiceComponentOptions
} from './guard-service.js';
export {
	EGRESS_DECLARED_COMPONENT_ID,
	EGRESS_NONE_COMPONENT_ID,
	egressComponents,
	egressDeclaredComponent,
	egressModeOf,
	egressNoneComponent
} from './egress.js';
export { compileComponents, componentDepsFor, type ComponentFit } from './compile.js';
export { stageBoundaryGuardrails } from './stage-guards.js';
export {
	compileStackLoop,
	stackBoundaryFits,
	stackEgressFits,
	stackGroupOf,
	stackLoopFits,
	stacksForStage
} from './stacks.js';
export { browserRefusal } from './connection.js';
