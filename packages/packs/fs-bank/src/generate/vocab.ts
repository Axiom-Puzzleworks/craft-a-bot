/**
 * The bank's fictional vocabularies (WP59, `48-FS-BANK.md` §4.2): employers,
 * merchants, devices, payees' shapes and complaint summaries — invented,
 * every one, so no fixture names a real business. Countries are real
 * country names: a country is not a person, and the sweep does not read
 * them.
 */
export const EMPLOYERS = [
	'Brightwater Logistics',
	'Cinderhaven Council',
	'Fenwick & Daughters',
	'Hollowmere NHS Trust (fictional)',
	'Kestrel Software',
	'Lantern Court Care Home',
	'Marchbank Foods',
	'Oakhurst Academy',
	'Quillstone Press',
	'Saltmarsh Marine',
	'Thornbury Motors',
	'Wetherby Fabrics'
] as const;

export const MERCHANTS: Readonly<Record<string, readonly string[]>> = {
	groceries: ['Marchbank Foods', 'The Corner Larder', 'Greenfold Market'],
	fuel: ['Windlass Fuels', 'Ropewalk Services'],
	transport: ['Netherby Rail', 'Kelder Bay Buses', 'Orrery Cabs'],
	restaurants: ['The Tinderbox', 'Ember & Ash', 'Pennyfarthing Kitchen'],
	utilities: ['Elmsgate Energy', 'Dunwater Water', 'Fable Fibre'],
	retail: ['Vellum Books', 'Spindle Home', 'Juniper Outfitters'],
	travel: ['Wyvern Air', 'Saltcote Hotels', 'Thistlewick Tours'],
	subscriptions: ['Gaslight Streaming', 'Candlemaker Cloud'],
	'cash-withdrawal': ['ATM — Brasswick Lane', 'ATM — Ironmonger Yard'],
	'online-marketplace': ['Orrery Market', 'Alder Row Auctions'],
	gambling: ['Quenby Bookmakers (fictional)'],
	crypto: ['Umber Exchange (fictional)']
};

export const MERCHANT_CATEGORIES = Object.keys(MERCHANTS);

export const DEVICES = [
	'app on the usual phone',
	'app on a new phone',
	'web on the usual laptop',
	'web on an unknown browser',
	'card at a terminal',
	'telephone banking'
] as const;

export const COUNTRIES = [
	'United Kingdom',
	'Ireland',
	'France',
	'Spain',
	'Germany',
	'Portugal'
] as const;

export const COMPLAINT_SUMMARIES: Readonly<Record<string, readonly string[]>> = {
	service: [
		'Waited forty minutes on the phone to report a lost card.',
		'Branch appointment cancelled twice.'
	],
	charges: [
		'An overdraft fee applied after a payment the app said had cleared.',
		'A charge on a dormant account.'
	],
	advice: [
		'Was told a fund was low risk; it fell fifteen percent in a month.',
		'Never asked about my other savings.'
	],
	'fraud-handling': [
		'My card was blocked while I was abroad with no warning.',
		'A payment I did not make was released.'
	],
	'lending-decision': [
		'Declined for a loan with no reason given.',
		'The affordability check ignored my second job.'
	],
	data: [
		'A letter about my health condition went to my old address.',
		'Marketing after I opted out.'
	]
};

export const FIRST_LINE_OF_NOTES = [
	'Customer prefers to be called by first name.',
	'Asked us not to phone before 10am.',
	'Power of attorney on file for the joint account.',
	'Requested large-print statements.'
] as const;
