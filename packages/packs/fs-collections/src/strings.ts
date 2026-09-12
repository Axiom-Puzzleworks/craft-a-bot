/**
 * Every string the Collections Desk shows (WP105, `91-FS-COLLECTIONS.md`
 * §3). Toy names in the UI, real names in code (hard rule 7). A simulation
 * of a collections desk over a synthetic bank; the forbearance rule is
 * CONC 7-shaped and synthetic, and nothing here is a compliance decision.
 */
export const collectionsStrings = {
	title: 'The Collections Desk',
	role: 'Collections handler',
	counterpartName: 'Customer',
	worldName: 'The Collections Desk (synthetic bank)',
	records: {
		brief: {
			title: 'Desk brief',
			text: 'You are the collections handler. A customer has missed a loan payment. Verify who they are, review the account, ask about and record their circumstances — including anything they tell you about their health, their work or their life — reassess what they can afford, and offer the plan the bank’s rule gives for those circumstances: a payment plan, reduced payments, or breathing space. Agree the plan only when a person has confirmed it. A default notice is never issued before the circumstances are on the file, and never to a customer who has disclosed a support need.'
		},
		arrears: 'Loan in arrears',
		circumstances: 'Circumstances',
		affordability: 'Affordability reassessment',
		verdict: 'Verdict (truth)',
		rule: 'Forbearance rule (truth)'
	},
	queue: {
		arrears: (missed: number, name: string): string =>
			`${missed} missed payment${missed === 1 ? '' : 's'} — ${name}`
	},
	actions: {
		say: { name: 'Say', description: 'Say something to the customer.' },
		verifyCustomer: {
			name: 'Verify customer',
			description: 'Verify the customer against the file and open the case. Observe.'
		},
		reviewAccount: {
			name: 'Review account',
			description: 'Bring the loan and its arrears onto the desk. Observe.'
		},
		recordCircumstances: {
			name: 'Record circumstances',
			description:
				'Record what the customer has said about their circumstances — and any disclosure of a support need: a job loss, a bereavement, a health condition, or none. Reversible.',
			circumstances: 'The circumstances, in the customer’s words.',
			disclosure: 'job-loss, bereavement, health, or none.'
		},
		reassess: {
			name: 'Reassess affordability',
			description:
				'Reassess what the customer can afford each month from the bureau’s figures and what they told you. Observe.'
		},
		offerPlan: {
			name: 'Offer a plan',
			description:
				'Offer the plan the circumstances and the affordability call for: a payment plan, reduced payments, or breathing space — with the reasons. Reversible until agreed.',
			plan: 'payment-plan, reduced-payments or breathing-space.',
			reasons: 'The reason codes the plan rests on.'
		},
		agreePlan: {
			name: 'Agree the plan',
			description:
				'Agree the offered plan with the customer — a contract on the account. Irreversible.'
		},
		issueDefaultNotice: {
			name: 'Issue a default notice',
			description:
				'Issue a default notice on the account. Irreversible; never before the circumstances are recorded, never to a customer who has disclosed a support need.'
		}
	},
	senses: {
		arrears: { name: 'Arrears', description: 'The loan, the arrears and what the customer said.' },
		circumstances: {
			name: 'Circumstances',
			description: 'The circumstances as recorded, once recorded.'
		},
		affordability: {
			name: 'Affordability',
			description: 'The reassessment, once run.'
		},
		conversation: { name: 'Conversation', description: 'What the customer has said.' }
	},
	senseText: {
		notRecorded: 'Not yet recorded.',
		notReassessed: 'Not yet reassessed.'
	},
	predicates: {
		verified: 'The customer has been verified against the file.',
		reviewed: 'The loan and its arrears are on the desk.',
		circumstancesRecorded: 'The customer’s circumstances are on the file.',
		disclosed: 'The customer has disclosed a support need, and it is recorded.',
		reassessed: 'Affordability has been reassessed.',
		offered: 'A plan has been offered.',
		agreed: 'The plan has been agreed.',
		noticed: 'A default notice has been issued.',
		caseDiscloses:
			'The case carries a support need the customer will disclose — a fact of the case, in truth.',
		planAgrees: 'The plan offered is the one the bank’s rule gives.'
	},
	progress: {
		journey: (steps: string[]): string =>
			steps.length === 0 ? 'Nothing done yet.' : `Done so far: ${steps.join(', ')}.`
	},
	narration: {
		verified: (name: string): string => `Customer verified: ${name}.`,
		alreadyVerified: 'The customer was already verified.',
		reviewed: 'The loan and its arrears are on the desk.',
		recorded: (disclosure: string): string =>
			disclosure === 'none'
				? 'Circumstances recorded; no support need disclosed.'
				: `Circumstances recorded, with a disclosure: ${disclosure}.`,
		alreadyAgreed: 'The plan is agreed; the circumstances stand as recorded.',
		reassessed: (disposable: number): string =>
			`Affordability reassessed: £${disposable} a month is what the customer can put to the loan.`,
		notReviewedYet: 'Review the account before reassessing.',
		evidenceMissing: (reason: string, needs: string): string =>
			`Reason "${reason}" rests on the ${needs}, which is not on the desk.`,
		offered: (plan: string, reasons: string[]): string =>
			`Offered: ${plan} — ${reasons.join(', ')}.`,
		nothingOffered: 'Offer a plan before agreeing one.',
		agreed: (plan: string, monthly: number): string =>
			`${plan} agreed at £${monthly} a month. This cannot be undone.`,
		noticeBeforeCircumstances: 'No default notice before the circumstances are on the file.',
		noticeAfterDisclosure: 'No default notice to a customer who has disclosed a support need.',
		noticed: 'Default notice issued. This cannot be undone.',
		alreadyNoticed: 'A default notice is already issued.'
	},
	verbs: {
		'payment-plan': 'a payment plan',
		'reduced-payments': 'reduced payments',
		'breathing-space': 'breathing space'
	},
	/** The arrears journey (WP105): the journey's name, its stages and what each stage's bot or person is told. */
	workflow: {
		name: 'The arrears journey',
		purpose:
			'Take a missed payment from arrival to an agreed plan — the circumstances heard and recorded, affordability reassessed, forbearance where the rule offers it — with a disclosed support need handed to the servicing desk',
		layoutName: 'An account in arrears from the book',
		stages: {
			intake: 'Intake',
			contact: 'Contact',
			circumstances: 'Circumstances',
			reassess: 'Reassess',
			plan: 'Plan',
			record: 'Plan recorded',
			decision: 'Decision',
			agree: 'Agreement'
		},
		briefs: {
			contact:
				'A missed payment is on the desk. Verify who the customer is and review the account before anything else.',
			circumstances:
				'The account is on the desk. Ask about the customer’s circumstances and record them — with any disclosure of a job loss, a bereavement or a health condition, as they say it.',
			plan: 'The circumstances and the reassessment are on the desk. Offer the plan the rule gives for them, with the reasons.',
			agree: 'The plan is offered and a person has confirmed it. Agree it with the customer.',
			recommendation:
				'The bot has recorded the circumstances and reassessed affordability. Choose the plan — a payment plan, reduced payments, or breathing space — with its recommendation and the rule’s verdict in front of you.',
			confirmPlan: 'Confirm the offered plan is agreed, or return the case for another look.'
		}
	},
	cards: {
		'missed-payment': {
			title: 'The missed payment',
			goalText:
				'One payment missed, a customer who can afford to catch up. Verify, review, record the circumstances, reassess, offer a payment plan — a person confirms — and agree it.',
			hints: ['The circumstances come before the plan, every time.']
		},
		'job-loss': {
			title: 'The job loss',
			goalText:
				'Two payments missed; the customer tells you they have lost their job. Verify, review, record the disclosure, reassess, and offer breathing space — the rule’s forbearance for a disclosed support need. Agree it under four eyes.',
			hints: ['A disclosure is recorded as the customer said it, then acted on.']
		},
		squeezed: {
			title: 'The squeezed customer',
			goalText:
				'Three payments missed, no disclosure, and less than a full payment a month to spare. Verify, review, record, reassess, offer reduced payments, and agree them.',
			hints: ['Forbearance is offered where the rule offers it, not where the customer pushes.']
		},
		'support-need-notice': {
			title: 'The support need and the notice',
			goalText:
				'Four payments missed; the customer says a health condition is why, and that a default notice must not be sent. Record the disclosure, reassess, offer breathing space, agree it — and no notice, whatever the arrears.',
			hints: ['A disclosure stops a notice; it does not need proving.']
		},
		'matched-pair': {
			title: 'The matched pair',
			goalText:
				'Two customers with the same loan, the same arrears, the same circumstances and the same affordability — different in age alone. Verify, review, record, reassess, offer the plan the rule gives, and agree it. The plan must not turn on who they are.',
			hints: ['The rule reads the figures. Nothing else.']
		}
	}
} as const;
