import type { PolicyCard } from '@craftabot/core';

/**
 * **A stage gate** (WP137, `110-CONTROL-SUITE-PLAN.md` §6): a policy card that
 * holds a journey's irreversible stage — disburse, open, reimburse, execute,
 * redress, file, agree, close — at its `stage-in` boundary until the desk's
 * own case file shows the steps before it done. It asks the desk's declared
 * predicates over its state (`world-predicate`), never the case's truth: the
 * check a bank's case-management system makes before money or a record moves,
 * whoever executes the stage — a rule, a person or a bot.
 *
 * At a boundary the proposed call is the stage itself (`69-…` §10), so the
 * rule names the stage's id; fitted in an agent loop instead, it would match
 * only an action of that exact name, which no desk has.
 */
export interface StageGateInput {
	/** Qualified like every card: `{packId}/policy/{slug}`. */
	id: string;
	title: string;
	/** The stage it holds. */
	stageId: string;
	/** The desk's predicates that must all hold before the stage starts. */
	requires: readonly string[];
	/** The reason a block gives, in the desk's words. */
	reason: string;
}

export function stageGateCard(input: StageGateInput): PolicyCard {
	return {
		id: input.id,
		title: input.title,
		description: `Holds the ${input.stageId} stage until the case file shows ${input.requires.join(', ')}. Fitted at the stage's input; it reads the desk's state, never the case's truth.`,
		schemaVersion: 1,
		rules: [
			{
				hook: 'pre-act',
				when: {
					kind: 'and',
					all: [
						{ kind: 'call-name-is', value: input.stageId },
						{
							kind: 'not',
							expr: {
								kind: 'and',
								all: input.requires.map((predicateId) => ({
									kind: 'world-predicate' as const,
									predicateId
								}))
							}
						}
					]
				},
				then: 'block-action',
				reason: input.reason
			}
		]
	};
}
