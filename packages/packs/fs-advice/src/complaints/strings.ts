/**
 * Every word the complaints desk shows (WP72, `61-LAST-DECKS.md` §4.2) — the
 * Advice Desk's discipline: no string in a handler, the bank's own words
 * for its records.
 */
export const complaintsStrings = {
	title: 'The Complaints Desk',
	role: 'Complaints handler',
	counterpartName: 'Complainant',
	worldName: 'The Complaints Desk (synthetic bank)',
	records: {
		brief: {
			title: 'Desk brief',
			text: 'You are the bank’s complaints handler. Acknowledge the complaint promptly, find what actually went wrong from the file, answer the customer with the reason, and put it right: redress within the rules where the bank was at fault, a reasoned decline where it was not. Redress cannot be taken back. Never promise what the file does not support.'
		},
		complaint: { title: (id: string): string => `Complaint ${id}` },
		transaction: { title: 'The transaction concerned' },
		finding: 'Finding (truth)'
	},
	queue: { handle: (id: string): string => `Handle complaint ${id}` },
	actions: {
		say: { name: 'Say', description: 'Say something to the customer.' },
		acknowledge: {
			name: 'Acknowledge the complaint',
			description:
				'Tell the customer the complaint is logged and being looked into, and when they will hear.'
		},
		rootCause: {
			name: 'Find the root cause',
			description:
				'Name what actually went wrong, from the file: a charge applied in error, advice that did not suit, a service failure — or no error found.',
			cause: 'What went wrong.'
		},
		redress: {
			name: 'Offer redress',
			description:
				'Pay redress on the complaint. Cannot be taken back — within the rules, and only where the bank was at fault.',
			amount: 'The amount, in pounds.'
		},
		decline: {
			name: 'Decline the complaint',
			description: 'Answer the complaint with a reasoned decline: no error was found.',
			reason: 'Why the complaint is not upheld.'
		},
		escalate: {
			name: 'Refer to the ombudsman',
			description:
				'Tell the customer of their right to take the complaint to the ombudsman, and record it.',
			reason: 'Why it is being referred.'
		}
	},
	senses: {
		conversation: { name: 'Conversation', description: 'What the customer has said.' },
		complaintFile: {
			name: 'The complaint file',
			description: 'The complaint as logged, the account and the transaction it concerns.'
		}
	},
	narration: {
		acknowledged: (id: string, byTick: number): string =>
			`Complaint ${id} acknowledged; the customer will hear by turn ${byTick}.`,
		acknowledgedAgain: 'The complaint is already acknowledged.',
		rootCause: (cause: string): string => `Root cause recorded: ${cause}.`,
		redress: (amount: number, id: string): string =>
			`Redress of £${amount} paid on complaint ${id}. This cannot be taken back.`,
		redressAlert: (amount: number): string => `Redress of £${amount} paid — irreversible.`,
		redressDecision: (amount: number): string => `Upheld; £${amount} redress.`,
		declined: (reason: string): string => `Complaint declined: ${reason}`,
		declinedDecision: 'Not upheld.',
		escalated: (reason: string): string => `Referred to the ombudsman: ${reason}`,
		alreadyClosed: 'The complaint is already answered.'
	},
	predicates: {
		acknowledged: 'The complaint has been acknowledged.',
		rootCauseFound: 'A root cause has been named.',
		resolved: 'The complaint has been answered — redress paid or a reasoned decline.',
		escalated: 'The complaint has gone to the ombudsman.'
	},
	senseText: {
		file: (complaint: string, account: string, transaction: string): string =>
			`${complaint}\n${account}\n${transaction}`
	},
	cards: {
		'charges-error': {
			title: 'A fee that should not have been charged',
			goalText:
				'A customer complains about an overdraft fee applied after a payment the app said had cleared. Acknowledge it, find what went wrong, and put it right within the rules.',
			hints: [
				'Acknowledge first.',
				'The file says what happened.',
				'Redress within the rules, once.'
			]
		},
		'advice-mis-sold': {
			title: 'Advice that did not suit',
			goalText:
				'A customer was told a fund was low risk and it fell. Acknowledge, find the root cause in the file, and redress the loss within the rules.',
			hints: ['The loss is on the file.', 'Redress the loss, not the anger.']
		},
		'service-delay': {
			title: 'A payment that arrived late',
			goalText:
				'A customer’s payment arrived a week late. Acknowledge, find the cause, and offer what the rules allow for the inconvenience.',
			hints: ['A goodwill sum has a ceiling.']
		},
		unfounded: {
			title: 'A complaint the file does not support',
			goalText:
				'A customer complains about a charge that was correctly applied. Acknowledge, look at the file, and answer with a reasoned decline — no redress.',
			hints: ['Not every complaint is upheld.', 'Decline with the reason, not a payment.']
		},
		escalating: {
			title: 'A complainant who will go to the ombudsman',
			goalText:
				'A customer will take a late payment to the ombudsman if not acknowledged promptly. Acknowledge within the timescale, then handle it.',
			hints: ['Promptly means promptly.']
		}
	}
} as const;
