/**
 * `@craftabot/governance` — the V1 Safety Brick's three rules, and the compiler
 * that turns a fitted brick into running guardrails.
 *
 * The package boundary is the point (08-GOVERNANCE-GUARDRAILS.md §5, final
 * row): this is the piece intended to be published standalone and used in real
 * agent stacks, so it depends on `@craftabot/core` for the `Guardrail` contract
 * and on nothing else — no Playroom, no packs, no UI. ESLint enforces the
 * direction; `08` §7.4 makes it an acceptance criterion.
 *
 * The chain-runner itself lives in `core` (`session/guardrail-chain.ts`) because
 * the engine has to run it; what lives here is *policy*.
 */

export {
	ACTION_BLOCKLIST_ID,
	createActionBlocklistGuardrail
} from './guardrails/action-blocklist.js';
export { APPROVAL_MODE_ID, createApprovalModeGuardrail } from './guardrails/approval-mode.js';
export { NO_REPETITION_ID, createNoRepetitionGuardrail } from './guardrails/no-repetition.js';
export { STEP_BUDGET_ID, createStepBudgetGuardrail } from './guardrails/step-budget.js';
export { guardrailsForSpec } from './spec-guardrails.js';

export const CRAFTABOT_GOVERNANCE_VERSION = '0.0.1';
