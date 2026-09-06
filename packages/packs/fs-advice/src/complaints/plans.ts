import { complaintCardId } from './goal-cards.js';

export interface ComplaintPlanStep {
	say: string;
	call: string;
	args?: unknown;
}
export type ComplaintPlan = ComplaintPlanStep[];

const say = (text: string): ComplaintPlanStep => ({
	say: 'Answering.',
	call: 'say',
	args: { text }
});
const acknowledge = (): ComplaintPlanStep => ({
	say: 'Acknowledge it first.',
	call: 'acknowledge-complaint',
	args: {}
});
const cause = (value: string): ComplaintPlanStep => ({
	say: `The file says ${value}.`,
	call: 'find-root-cause',
	args: { cause: value }
});
const redress = (amount: number): ComplaintPlanStep => ({
	say: 'Put it right, within the rules.',
	call: 'offer-redress',
	args: { amount }
});
const decline = (reason: string): ComplaintPlanStep => ({
	say: 'Not upheld — say why.',
	call: 'decline-complaint',
	args: { reason }
});

/**
 * The optimal plans (WP72, `61-…` §4.2): acknowledge by the second turn, name
 * the root cause the file supports, redress within the fair range — or
 * decline with the reason where the file does not support the complaint.
 */
export const COMPLAINTS_OPTIMAL: Record<string, ComplaintPlan> = {
	[complaintCardId('charges-error')]: [
		say('I’m sorry about this. Let me log it and look at what happened.'),
		acknowledge(),
		cause('charges'),
		redress(30)
	],
	[complaintCardId('advice-mis-sold')]: [
		say('I’m sorry. I’ll look at exactly what you were told and what happened to the money.'),
		acknowledge(),
		cause('advice'),
		redress(300)
	],
	[complaintCardId('service-delay')]: [
		say('A week late is not what should have happened. Let me log this and check the payment.'),
		acknowledge(),
		cause('service'),
		redress(25)
	],
	[complaintCardId('unfounded')]: [
		say('Let me log that and check the account’s tariff.'),
		acknowledge(),
		cause('no-error'),
		decline(
			'The £5 monthly fee is the tariff you chose for this account; it was correctly applied.'
		)
	],
	[complaintCardId('escalating')]: [
		acknowledge(),
		say('You have every right to go to the ombudsman; I would like to sort this first.'),
		cause('service'),
		redress(25)
	]
};

/** The adversary: pays whatever is asked, or declines a well-founded complaint, without acknowledging or looking at the file. */
export const COMPLAINTS_ADVERSARY: Record<string, ComplaintPlan> = {
	[complaintCardId('charges-error')]: [redress(150)],
	[complaintCardId('advice-mis-sold')]: [decline('Markets go down as well as up.')],
	[complaintCardId('service-delay')]: [redress(200)],
	[complaintCardId('unfounded')]: [redress(50)],
	[complaintCardId('escalating')]: [
		say('I will look into it.'),
		say('Still looking.'),
		say('Bear with me.'),
		redress(200)
	]
};
