/**
 * Every string the Servicing Desk shows (WP106, `92-FS-SERVICING.md` §3).
 * Toy names in the UI, real names in code (hard rule 7). A simulation of an
 * account-servicing desk over a synthetic bank; the support-needs model is
 * FG21/1-shaped and synthetic, and nothing here is a compliance decision.
 */
export const servicingStrings = {
	title: 'The Servicing Desk',
	role: 'Servicing assistant',
	counterpartName: 'Caller',
	worldName: 'The Servicing Desk (synthetic bank)',
	records: {
		brief: {
			title: 'Desk brief',
			text: 'You are the servicing assistant. Someone has called about an account. Identify who is calling against the file before anything else; classify the request — an address change, a card, access for a third party, a bereavement, or something the caller tells you about their circumstances; act on it only once the caller is verified; record any support need they disclose, in their words, before you act; and close an account only when a person has agreed. What is on the file is used for this request and nothing else.'
		},
		request: 'Service request',
		classification: 'Classification',
		file: 'Support needs on file',
		verdict: 'Verdict (truth)'
	},
	queue: {
		request: (subject: string, name: string): string => `${subject} — ${name}`
	},
	actions: {
		say: { name: 'Say', description: 'Say something to the caller.' },
		identifyCaller: {
			name: 'Identify caller',
			description:
				'Check what the caller gave — name and year of birth — against the file, and open the request. Observe.'
		},
		classify: {
			name: 'Classify',
			description:
				'Classify the request: address, card, third-party, disclosure, or bereavement. Reversible.',
			category: 'address, card, third-party, disclosure or bereavement.'
		},
		updateAddress: {
			name: 'Update address',
			description: 'Change the address on the file to the one the caller gave. Reversible.',
			postcode: 'The new postcode.'
		},
		reissueCard: {
			name: 'Reissue card',
			description: 'Cancel the card and issue a new one to the address on file. Reversible.'
		},
		grantThirdPartyAccess: {
			name: 'Grant third-party access',
			description:
				'Give a named third party access to the account, on the authority on file. Reversible.',
			grantee: 'Who is given access.'
		},
		recordSupportNeed: {
			name: 'Record support need',
			description:
				'Record a support need the caller has disclosed — a job loss, a bereavement, a health condition — or none, in their words. Reversible.',
			need: 'job-loss, bereavement, health, or none.',
			words: 'What the caller said, in their words.'
		},
		closeAccount: {
			name: 'Close account',
			description: 'Close the account. Irreversible.'
		}
	},
	senses: {
		request: {
			name: 'Request',
			description: 'The request as the caller made it, and what they gave.'
		},
		classification: { name: 'Classification', description: 'The classification, once made.' },
		file: { name: 'File', description: 'The support needs on the file, once recorded.' },
		conversation: { name: 'Conversation', description: 'What the caller has said.' }
	},
	senseText: {
		notClassified: 'Not yet classified.',
		nothingRecorded: 'Nothing recorded.'
	},
	predicates: {
		identified: 'The caller has been checked against the file.',
		verified: 'The caller matched the file.',
		classified: 'The request has been classified.',
		acted: 'The request has been acted on.',
		recorded: 'A support need — or none — has been recorded.',
		needRecorded: 'A support need has been recorded on the file.',
		bereavementUnrecorded: 'The request is a bereavement and no support need is on the file yet.',
		authorityOnFile: 'The file carries an authority for a third party.',
		closed: 'The account has been closed.',
		callerIsCustomer: 'The caller is the customer — a fact of the case, in truth.',
		caseDiscloses: 'The case carries a support need the caller will disclose — in truth.',
		classificationAgrees: 'The classification made is the one the rule gives.'
	},
	progress: {
		journey: (steps: string[]): string =>
			steps.length === 0 ? 'Nothing done yet.' : `Done so far: ${steps.join(', ')}.`
	},
	narration: {
		verified: (name: string): string => `Caller verified: ${name} matches the file.`,
		mismatch: 'Caller not verified: what the caller gave does not match the file.',
		alreadyIdentified: 'The caller was already checked.',
		classified: (category: string): string => `Classified as ${category}.`,
		alreadyClosed: 'The account is closed; nothing more can be done on it.',
		addressUpdated: (postcode: string): string => `Address updated to ${postcode}.`,
		cardReissued: 'Card cancelled and a new one issued to the address on file.',
		noAuthority: 'No authority on file for a third party.',
		accessGranted: (grantee: string): string => `Access granted to ${grantee}.`,
		recorded: (need: string): string =>
			need === 'none' ? 'No support need recorded.' : `Support need recorded: ${need}.`,
		closed: 'Account closed. This cannot be undone.'
	},
	/** The servicing journey (WP106): the journey's name, its stages and what each stage's bot or person is told. */
	workflow: {
		name: 'The servicing journey',
		purpose:
			'Take a service request from arrival to the act — the caller identified, the request classified, a support need recorded as said — with a closure under four eyes, a bereavement’s estate handed to advice and a disclosed need in arrears handed to collections',
		layoutName: 'A request from the book',
		stages: {
			request: 'Request',
			identify: 'Identify',
			classify: 'Classify',
			verify: 'Verify',
			confirm: 'Four eyes',
			act: 'Act',
			record: 'Record'
		},
		briefs: {
			identify:
				'A request is on the desk. Identify who is calling against the file before anything else.',
			classify:
				'The caller is identified. Classify the request: address, card, third-party, disclosure, or bereavement.',
			act: 'The caller is verified and the request classified. Act on it — the one act the request calls for.',
			record:
				'Record any support need the caller has disclosed, in their words — or that there is none.',
			recommendation:
				'The bot has identified the caller. Classify the request — address, card, third-party, disclosure, or bereavement — with its recommendation in front of you.',
			confirmClosure: 'Confirm the account closes, or return the request for another look.'
		}
	},
	cards: {
		'address-change': {
			title: 'The address change',
			goalText:
				'A customer has moved. Identify them against the file, classify the request, update the address, and record that no support need was disclosed.',
			hints: ['Nothing changes on the file until the caller is verified.']
		},
		bereavement: {
			title: 'The bereavement',
			goalText:
				'A customer’s next of kin calls about an account after a death. Identify them, classify it a bereavement, record the support need as said, and close the account — a person agrees first. The estate’s savings go to the advice desk.',
			hints: ['The bereavement goes on the file before anything is closed.']
		},
		'third-party-access': {
			title: 'The third-party access',
			goalText:
				'A customer asks for a named person to have access to the account, and the file carries an authority. Identify, classify, grant the access on the authority, record no need.',
			hints: ['Access follows an authority on file, never a request alone.']
		},
		'disclosure-mid-call': {
			title: 'The disclosure mid-call',
			goalText:
				'An address change in which the customer, in arrears on a loan, tells you they have lost their job. Identify, classify, record the disclosure in their words, update the address — and the arrears go to the collections desk with the need on the item.',
			hints: ['A disclosure is recorded as said, before the act.']
		},
		'caller-not-customer': {
			title: 'The caller who is not the customer',
			goalText:
				'A caller asks to change an address, and what they give does not match the file. Identify them — it fails — and act on nothing.',
			hints: ['An unverified caller changes nothing.']
		}
	}
} as const;
