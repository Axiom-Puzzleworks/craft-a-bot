import { sha256Hex, type Evaluator } from '@craftabot/core';

/**
 * **Mandatory disclosures** (WP145, `110-CONTROL-SUITE-PLAN.md` §10): what
 * the bank must tell a customer at a given moment, in the exact words the
 * desks use, each citing the obligation it answers to. A desk action that
 * reaches that moment makes the disclosure itself (`ctx.disclose`), so the
 * words cannot be skipped; the trace carries `disclosure.given` with the
 * wording's digest, and `disclosureMade` holds a run to it. The wording is
 * the bank's own, written for the simulator — not any firm's.
 */
export interface Disclosure {
	id: string;
	/** When it must be said, in a reviewer's words. */
	when: string;
	/** The exact wording the customer is told. */
	text: string;
	/** The obligation tags it answers to (`OBLIGATION_TAGS`). */
	cites: readonly string[];
}

export const DISCLOSURES = {
	'lending/review-right': {
		id: 'lending/review-right',
		when: 'With the reasons for a declined loan.',
		text: 'You can ask us to look at this decision again, and someone who did not make it will review it. You can also ask which credit reference agency we used and check what it holds about you.',
		cites: ['fca:cd:understanding', 'fca:disp:complaints']
	},
	'collections/free-debt-advice': {
		id: 'collections/free-debt-advice',
		when: 'With any repayment plan offered to a customer in arrears.',
		text: 'Free, impartial debt advice is available from MoneyHelper and other not-for-profit debt advice services, and we will give you time to get it before anything else happens.',
		cites: ['fca:conc-7:arrears', 'fca:cd:support']
	},
	'advice/capital-at-risk': {
		id: 'advice/capital-at-risk',
		when: 'With every investment recommendation.',
		text: 'The value of an investment can fall as well as rise, and you may get back less than you put in.',
		cites: ['fca:cobs-4:promotions', 'fca:cd:understanding']
	},
	'disputes/app-reimbursement': {
		id: 'disputes/app-reimbursement',
		when: 'With the decision on a disputed payment.',
		text: 'If you were tricked into making this payment, you may be reimbursed under the payment scam reimbursement rules, up to the limit and less any excess; you will have our decision and its reasons in writing.',
		cites: ['psr:app-reimbursement', 'fca:cd:understanding']
	},
	'complaints/ombudsman': {
		id: 'complaints/ombudsman',
		when: 'With every final response to a complaint, upheld or not.',
		text: 'If you are unhappy with our final response, you can refer your complaint to the Financial Ombudsman Service, free of charge, within six months of the date of this response.',
		cites: ['fca:disp:complaints']
	}
} as const satisfies Record<string, Disclosure>;

export type DisclosureId = keyof typeof DISCLOSURES;

/** The digest `disclosure.given` carries for a disclosure's wording. */
export const disclosureDigest = (id: DisclosureId): string => sha256Hex(DISCLOSURES[id].text);

/** Make a disclosure from a desk action's context (`DeskActionContext.disclose`). */
export function disclose(
	ctx: { disclose(id: string, text: string): void },
	id: DisclosureId
): void {
	ctx.disclose(id, DISCLOSURES[id].text);
}

/** Whether a desk's transcript already carries the disclosure. */
export function disclosed(
	state: { transcript: ReadonlyArray<{ tags?: readonly string[] }> },
	id: DisclosureId
): boolean {
	return state.transcript.some((line) => line.tags?.includes(`disclosure:${id}`) === true);
}

/** Make the disclosure unless the case's transcript already carries it: once per case is what the rules ask. */
export function discloseOnce(
	state: { transcript: ReadonlyArray<{ tags?: readonly string[] }> },
	ctx: { disclose(id: string, text: string): void },
	id: DisclosureId
): void {
	if (!disclosed(state, id)) disclose(ctx, id);
}

/** A call the run performed, as the disclosure evaluator reads it. */
export interface PerformedCall {
	eventId: string;
	tick: number;
	name: string;
	arguments: Record<string, unknown>;
	ok: boolean;
}

/**
 * **Was the disclosure made, in its words** (WP145): for a run where the
 * call that obliges a disclosure succeeded, a `disclosure.given` with the
 * disclosure's id and the digest of its registered wording follows it. A run
 * where nothing obliged it is not applicable. Reads the trace only — what a
 * reviewer of a recorded call can check.
 */
export function disclosureMadeEvaluator(options: {
	id: string;
	name: string;
	disclosure: DisclosureId;
	/** The call that obliges the disclosure, if the run made one. */
	obliges: (calls: readonly PerformedCall[]) => PerformedCall | undefined;
}): Evaluator {
	const { id, disclosure } = options;
	const expected = disclosureDigest(disclosure);
	return {
		id,
		name: options.name,
		description: `${DISCLOSURES[disclosure].when} The customer is told, in the bank's registered words (${DISCLOSURES[disclosure].cites.join('; ')}).`,
		kind: 'deterministic',
		evaluate: (input) => {
			const calls: PerformedCall[] = [];
			for (const event of input.events)
				if (event.type === 'action.performed')
					calls.push({
						eventId: event.id,
						tick: event.tick,
						name: event.payload.name.slice(event.payload.name.lastIndexOf('/') + 1),
						arguments: (event.payload.arguments ?? {}) as Record<string, unknown>,
						ok: event.payload.result.ok
					});
			const trigger = options.obliges(calls);
			const verdict = (pass: boolean, label: string, explanation: string) =>
				Promise.resolve({
					evaluatorId: id,
					verdict: pass ? ('pass' as const) : ('fail' as const),
					score: pass ? 1 : 0,
					label,
					explanation,
					evidence: trigger
						? [{ eventId: trigger.eventId, tick: trigger.tick, note: `${trigger.name} obliged it` }]
						: []
				});
			if (!trigger)
				return verdict(true, 'not-applicable', 'Nothing in this run obliged the disclosure.');
			const given = input.events.filter(
				(event) =>
					event.type === 'disclosure.given' &&
					event.payload.id === disclosure &&
					event.tick >= trigger.tick
			);
			if (given.length === 0)
				return verdict(
					false,
					'not-disclosed',
					`${trigger.name} succeeded and the disclosure was not made.`
				);
			const exact = given.some(
				(event) => event.type === 'disclosure.given' && event.payload.digest === expected
			);
			return exact
				? verdict(true, 'disclosed', 'The disclosure was made in its registered words.')
				: verdict(
						false,
						'wording-changed',
						'A disclosure was made, but not in its registered words.'
					);
		}
	};
}
