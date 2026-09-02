/**
 * `@craftabot/governance` — the policy *mechanisms*: a step budget, an action
 * blocklist, a loop-breaker, an approval gate.
 *
 * > **Amended 2026-08-13 (WP14 slice 3d):** `guardrailsForSpec` — the compiler
 * > that turned a fitted Safety Brick into running guardrails — has gone. It
 * > read `spec.bricks.safety` by name, so it could compile exactly one brick and
 * > no others, which is `12-…` D11 in the place it costs most: a Monitor brick
 * > could contribute no policy without a core change. Bricks now install their
 * > own rules through `contributeGuardrails` (`14-…` §2.1), and
 * > `starter/safety` composes the four factories below from its own dials.
 * >
 * > The package boundary is unchanged and the seam it protected is still here:
 * > this package ships the mechanisms, a pack decides which of them a brick
 * > installs, and V1.x policy cards (`08-…` §5) will arrive as a second
 * > *compiler beside* the bricks — the host's `CreateSessionDeps.guardrails`,
 * > which the session still honours.
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
export {
	APPROVAL_MODE_ID,
	createApprovalModeGuardrail,
	type ApprovalMode
} from './guardrails/approval-mode.js';
export { NO_REPETITION_ID, createNoRepetitionGuardrail } from './guardrails/no-repetition.js';
export { STEP_BUDGET_ID, createStepBudgetGuardrail } from './guardrails/step-budget.js';
export { TOKEN_BUDGET_ID, createTokenBudgetGuardrail } from './guardrails/token-budget.js';
export { TOOL_BLOCKLIST_ID, createToolBlocklistGuardrail } from './guardrails/tool-blocklist.js';
/** The policy-card compiler (`14-…` §4.6, WP22) — see `08-…` §5's growth-path row: this is the piece named to ship standalone. */
export {
	compilePolicyCard,
	evaluatePredicate,
	type PredicateEvalContext
} from './policy-compiler.js';

/**
 * The hosted-guardrail shell (`29-GUARD-SHELL.md` §4.4, WP39 stage C): what
 * turns any `GuardrailService` into guardrails at its hooks — the dials, the
 * verdict mapping, the selectors, the strings, and the trace record.
 */
export {
	categoryDispositionSchema,
	dispositionSchema,
	hostedScreenConfigSchema,
	type CategoryDisposition,
	type Disposition,
	type HostedScreenConfig,
	type HostedScreenConfigInput
} from './hosted/config.js';
export {
	createHostedGuardrails,
	filtersForRecord,
	type CreateHostedGuardrailsOptions,
	type HostedGuardrailNames
} from './hosted/guardrails.js';
export {
	decisionSelector,
	defaultSelectors,
	observationSelector,
	observationText,
	renderCall,
	resultSelector,
	stringifyToolResult,
	type Screen,
	type TextSelector
} from './hosted/selectors.js';
export {
	defaultHostedStrings,
	joinWithAnd,
	type HostedStrings,
	type MatchedFinding
} from './hosted/strings.js';
export { clampForHook, verdictForReading } from './hosted/verdict.js';

export const CRAFTABOT_GOVERNANCE_VERSION = '0.0.1';
