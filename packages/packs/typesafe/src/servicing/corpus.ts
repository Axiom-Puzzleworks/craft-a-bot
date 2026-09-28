import type { Category, SupportNeed } from '@craftabot/pack-fs-servicing';

/**
 * **The labelled servicing corpus** (`98-JEV.md` §8): what callers say when
 * they ring the servicing desk, each utterance labelled with the request it
 * makes and the support need it discloses — authored for this experiment,
 * synthetic throughout (hard rule 9: no person, number or place in it is
 * real; no digits at all), and **frozen before Jev saw any of it**, so the
 * questions in `questions.ts` were not tuned against these answers.
 *
 * The labelling guide, the same words the questions use:
 * - **address** — change the address held on the caller's own account, because
 *   they have moved or are moving home.
 * - **card** — replace or stop a bank card that is lost, stolen, damaged,
 *   expired or not working.
 * - **third-party** — let another living person access, manage or act on the
 *   caller's account.
 * - **bereavement** — deal with the account of someone who has died.
 * - **disclosure** — none of the above: the caller only tells the bank about
 *   their circumstances.
 * - A **need** is one the caller discloses about themselves or someone close:
 *   `job-loss` (lost their job or income from work), `bereavement` (someone
 *   close has died), `health` (a physical or mental condition, illness,
 *   injury, disability or treatment), else `none`.
 *
 * Each row carries a **difficulty tag**, so results can be sliced:
 * - `plain` — the canonical wording, which the bank's regex was written for.
 * - `paraphrase` — the meaning is plain to a person, and the regex's words are absent.
 * - `trap` — words the regex keys on, used in a sense it does not mean ("my card died").
 * - `mixed` — a request with a need disclosed in passing.
 *
 * The tag is the author's prediction of difficulty, set before any run; the
 * results say whether it held.
 */
export type Difficulty =
	| 'plain'
	| 'paraphrase'
	| 'trap'
	| 'mixed'
	// v2 (`corpus-v2.ts`):
	| 'long'
	| 'negation'
	| 'hypothetical'
	| 'informal'
	| 'sarcasm'
	| 'euphemism'
	| 'transcript'
	| 'steer'
	| 'double'
	| 'distant';

export interface CorpusRow {
	id: string;
	text: string;
	category: Category;
	need: SupportNeed;
	tag: Difficulty;
	/** v2: why the label is a judgment call a careful person could make the other way — reported apart. */
	contested?: string;
	/** v2: the blind second labeller's need, where it differs from this row's — scored as an alternative, never as the truth. */
	secondNeed?: SupportNeed;
	/** v3: the blind second labeller's category, where it differs. */
	secondCategory?: Category;
}

const row = (
	id: string,
	category: Category,
	need: SupportNeed,
	tag: Difficulty,
	text: string
): CorpusRow => ({ id, text, category, need, tag });

export const SERVICING_CORPUS: readonly CorpusRow[] = [
	// ── address ────────────────────────────────────────────────────────
	row(
		'a01',
		'address',
		'none',
		'plain',
		'I have moved house and need the address on my account changed.'
	),
	row('a02', 'address', 'none', 'plain', "Please update my address, I've moved to a new flat."),
	row(
		'a03',
		'address',
		'none',
		'plain',
		'Can you change the postcode on my account? I moved last week.'
	),
	row('a04', 'address', 'none', 'plain', 'I need to update my home address please.'),
	row(
		'a05',
		'address',
		'none',
		'paraphrase',
		"I've relocated to the other side of the city and want my statements going to the right place."
	),
	row(
		'a06',
		'address',
		'none',
		'paraphrase',
		"We've just bought our first home, so letters should go there from now on."
	),
	row(
		'a07',
		'address',
		'none',
		'paraphrase',
		"I don't live at the old place any more; can you point the account to where I'm living now?"
	),
	row(
		'a08',
		'address',
		'none',
		'paraphrase',
		"I'm emigrating at the end of the month and the bank needs to know where I'll be living."
	),
	row(
		'a09',
		'address',
		'none',
		'paraphrase',
		"Change of residence: I'm now living with my sister in the next town."
	),
	row(
		'a10',
		'address',
		'none',
		'paraphrase',
		"Could you update where you send my correspondence? I've been somewhere new since the spring."
	),
	row(
		'a11',
		'address',
		'none',
		'paraphrase',
		"Just letting you know my home's changed; I'm in the village now, not the town."
	),
	row(
		'a12',
		'address',
		'none',
		'paraphrase',
		'Where do I tell you that I live somewhere different now?'
	),
	row(
		'a13',
		'address',
		'none',
		'trap',
		"I've moved onto a new estate and need my details updated."
	),
	row(
		'a14',
		'address',
		'none',
		'trap',
		"I can't access my post at the old house since I moved, so please update it."
	),
	row(
		'a15',
		'address',
		'none',
		'trap',
		"My phone died so I couldn't ring sooner — I've moved and need my address updated."
	),
	row(
		'a16',
		'address',
		'none',
		'trap',
		'My card statements keep going to my old address; I moved out in the summer.'
	),
	row(
		'a17',
		'address',
		'none',
		'trap',
		'The previous owner of my new house passed away, and I have moved in — please update my address.'
	),
	row(
		'a18',
		'address',
		'none',
		'trap',
		'My old job was at the hospital; I have moved house for a new one and need my address changed.'
	),
	row(
		'a19',
		'address',
		'health',
		'mixed',
		"I've had to move into sheltered housing after my stroke, so please change my address."
	),
	row(
		'a20',
		'address',
		'job-loss',
		'mixed',
		'I lost my job so I have moved back in with my parents — can you change my address?'
	),
	row(
		'a21',
		'address',
		'job-loss',
		'mixed',
		"After being let go from the factory I couldn't afford the rent, so I'm somewhere cheaper now. New address please."
	),
	row(
		'a22',
		'address',
		'bereavement',
		'mixed',
		"Since Mum passed I've moved into her house, so my address needs changing."
	),
	row(
		'a23',
		'address',
		'health',
		'mixed',
		"I'm moving nearer the hospital for my dialysis, so I need my address updated."
	),
	row(
		'a24',
		'address',
		'none',
		'paraphrase',
		'Our family has just settled into a bigger place across town — please update our details.'
	),

	// ── card ───────────────────────────────────────────────────────────
	row('c01', 'card', 'none', 'plain', 'My card has been lost and I need a new one.'),
	row('c02', 'card', 'none', 'plain', 'My debit card was stolen yesterday.'),
	row(
		'c03',
		'card',
		'none',
		'plain',
		'The chip on my card has stopped working, can I get a replacement?'
	),
	row('c04', 'card', 'none', 'plain', 'Please send me a replacement card.'),
	row('c05', 'card', 'none', 'plain', 'I was mugged and they took my bank card.'),
	row(
		'c06',
		'card',
		'none',
		'paraphrase',
		'Someone pinched my wallet on the train and I need to stop the plastic and get it replaced.'
	),
	row(
		'c07',
		'card',
		'none',
		'paraphrase',
		"The cash machine swallowed it this morning and wouldn't give it back — I need a replacement to pay for things."
	),
	row(
		'c08',
		'card',
		'none',
		'paraphrase',
		"My debit's snapped clean in half, can you send another?"
	),
	row(
		'c09',
		'card',
		'none',
		'paraphrase',
		"I've mislaid my contactless and need a new one sent out."
	),
	row(
		'c10',
		'card',
		'none',
		'paraphrase',
		"The magnetic strip's worn out and shops keep declining me. I need a fresh one."
	),
	row(
		'c11',
		'card',
		'none',
		'paraphrase',
		'Somebody has been using my debit at petrol stations; I still have it but I want it stopped and replaced.'
	),
	row(
		'c12',
		'card',
		'none',
		'paraphrase',
		'My purse was nicked at the market with my bank stuff in it and I need to stop the one for this account.'
	),
	row(
		'c13',
		'card',
		'none',
		'trap',
		"My card died — it just won't tap any more. Can you send a new one?"
	),
	row(
		'c14',
		'card',
		'none',
		'trap',
		"I can't access my money because my card's been cancelled — I need a new one."
	),
	row(
		'c15',
		'card',
		'none',
		'trap',
		'The replacement went to the address I moved from, so it has never arrived — please send another card.'
	),
	row(
		'c16',
		'card',
		'health',
		'mixed',
		"I'm in hospital and my card's gone missing from the ward — can you replace it?"
	),
	row(
		'c17',
		'card',
		'health',
		'mixed',
		'With my dementia I keep losing things, and now my card has gone. Please send a new one.'
	),
	row(
		'c18',
		'card',
		'job-loss',
		'mixed',
		"I've been made redundant and in all the upheaval my card has gone missing."
	),
	row(
		'c19',
		'card',
		'health',
		'mixed',
		"My hands shake too much since the Parkinson's to use the chip and pin — can I get a card I can tap?"
	),
	row(
		'c20',
		'card',
		'none',
		'paraphrase',
		'The dog chewed my bank card to bits. How do I get another?'
	),

	// ── third-party ────────────────────────────────────────────────────
	row(
		't01',
		'third-party',
		'none',
		'plain',
		'I would like my daughter to have access to the account on my behalf.'
	),
	row(
		't02',
		'third-party',
		'none',
		'plain',
		'I have power of attorney for my father and need to be added to his account.'
	),
	row('t03', 'third-party', 'none', 'plain', 'Can my son manage the account on my behalf?'),
	row('t04', 'third-party', 'none', 'plain', "I'd like to add a third party to my account."),
	row(
		't05',
		'third-party',
		'none',
		'paraphrase',
		'Could my husband be allowed to deal with the bank for me when I am away?'
	),
	row(
		't06',
		'third-party',
		'none',
		'paraphrase',
		'I want to give my brother authority to talk to you about my account.'
	),
	row(
		't07',
		'third-party',
		'none',
		'paraphrase',
		"I'd like my accountant to be able to see my statements."
	),
	row(
		't08',
		'third-party',
		'none',
		'paraphrase',
		'Please set my daughter up as someone who can act for me on the account.'
	),
	row(
		't09',
		'third-party',
		'none',
		'paraphrase',
		'Can you register my son as a trusted person who can phone you for me?'
	),
	row(
		't10',
		'third-party',
		'none',
		'trap',
		'I want my daughter to be able to do my banking — the card and everything.'
	),
	row(
		't11',
		'third-party',
		'bereavement',
		'trap',
		"My late husband's brother wants to help me with my account; can he be added?"
	),
	row(
		't12',
		'third-party',
		'none',
		'trap',
		'I have moved my mother in with me and now look after her money — please add me to her account.'
	),
	row(
		't13',
		'third-party',
		'health',
		'mixed',
		'Since my diagnosis I would like my wife to be able to handle the account on my behalf.'
	),
	row(
		't14',
		'third-party',
		'health',
		'mixed',
		"I'm going in for chemotherapy and want my sister to be able to run things for me while I'm poorly."
	),
	row(
		't15',
		'third-party',
		'health',
		'mixed',
		"My eyesight's going and I'd like my niece to be able to sort out my banking for me."
	),
	row(
		't16',
		'third-party',
		'none',
		'paraphrase',
		'My neighbour helps me with paperwork; can she speak to you about my account?'
	),

	// ── bereavement ────────────────────────────────────────────────────
	row(
		'b01',
		'bereavement',
		'bereavement',
		'plain',
		'My mother passed away last month; I am calling about her account.'
	),
	row(
		'b02',
		'bereavement',
		'bereavement',
		'plain',
		"My father died and I'm the executor of his estate."
	),
	row('b03', 'bereavement', 'bereavement', 'plain', "I'm calling about my late husband's account."),
	row(
		'b04',
		'bereavement',
		'bereavement',
		'plain',
		'The account holder is deceased and I am handling probate.'
	),
	row(
		'b05',
		'bereavement',
		'bereavement',
		'paraphrase',
		'We lost Dad in March and I need to sort out what happens to his savings.'
	),
	row(
		'b06',
		'bereavement',
		'bereavement',
		'paraphrase',
		"My wife is no longer with us and I don't know what to do about her account."
	),
	row(
		'b07',
		'bereavement',
		'bereavement',
		'paraphrase',
		"I'm dealing with my grandmother's affairs now that she's gone."
	),
	row(
		'b08',
		'bereavement',
		'bereavement',
		'paraphrase',
		"My brother was killed in an accident and I'm handling his accounts."
	),
	row(
		'b09',
		'bereavement',
		'bereavement',
		'paraphrase',
		'Following the death of my partner, I need to close her account.'
	),
	row(
		'b10',
		'bereavement',
		'bereavement',
		'paraphrase',
		"Mum's funeral was last week; the solicitor told me to ring you about her current account."
	),
	row(
		'b11',
		'bereavement',
		'bereavement',
		'paraphrase',
		"I'm the administrator for my uncle's affairs after he passed."
	),
	row(
		'b12',
		'bereavement',
		'bereavement',
		'paraphrase',
		"I'm newly widowed and our joint account needs sorting out."
	),
	row(
		'b13',
		'bereavement',
		'bereavement',
		'plain',
		'I need to let you know my aunt has sadly died and I am her next of kin.'
	),
	row(
		'b14',
		'bereavement',
		'bereavement',
		'paraphrase',
		'Dad lost his fight with cancer on Sunday. What do I need to do about his bank account?'
	),
	row(
		'b15',
		'bereavement',
		'bereavement',
		'trap',
		'My mother died, and her card is still active — please close her account.'
	),

	// ── disclosure ─────────────────────────────────────────────────────
	row(
		'd01',
		'disclosure',
		'job-loss',
		'plain',
		'I wanted to let you know that I lost my job last month and I am behind on the loan.'
	),
	row('d02', 'disclosure', 'job-loss', 'plain', "I've been made redundant and wanted you to know."),
	row('d03', 'disclosure', 'job-loss', 'plain', 'I was laid off yesterday.'),
	row(
		'd04',
		'disclosure',
		'job-loss',
		'paraphrase',
		"My contract wasn't renewed and money is going to be tight for a while."
	),
	row(
		'd05',
		'disclosure',
		'job-loss',
		'paraphrase',
		"The shop I worked at closed down, so I've no wages coming in."
	),
	row(
		'd06',
		'disclosure',
		'job-loss',
		'paraphrase',
		"I've been let go and I'm worried about my payments."
	),
	row(
		'd07',
		'disclosure',
		'job-loss',
		'paraphrase',
		"I've lost my income since my business went under."
	),
	row(
		'd08',
		'disclosure',
		'job-loss',
		'paraphrase',
		"Work's dried up completely since the site closed and I'm falling behind."
	),
	row(
		'd09',
		'disclosure',
		'health',
		'plain',
		"I've been diagnosed with a heart condition and may struggle to get to the branch."
	),
	row(
		'd10',
		'disclosure',
		'health',
		'paraphrase',
		"I'm going through treatment for cancer and some days I can't manage phone calls."
	),
	row(
		'd11',
		'disclosure',
		'health',
		'paraphrase',
		"I've got really bad anxiety and phone calls are hard, please write to me instead."
	),
	row(
		'd12',
		'disclosure',
		'health',
		'paraphrase',
		"I'm registered blind, so letters in normal print are no good to me."
	),
	row(
		'd13',
		'disclosure',
		'health',
		'paraphrase',
		"Just so you're aware, I'm recovering from a breakdown and might need things explained slowly."
	),
	row(
		'd14',
		'disclosure',
		'health',
		'paraphrase',
		'I had a stroke over the summer and my memory is not what it was.'
	),
	row(
		'd15',
		'disclosure',
		'health',
		'paraphrase',
		"I'm pregnant and I've been signed off sick with complications."
	),
	row(
		'd16',
		'disclosure',
		'bereavement',
		'trap',
		"My husband died recently and I'm finding it hard to cope with the bills."
	),
	row(
		'd17',
		'disclosure',
		'none',
		'trap',
		"I'm ill with worry about my overdraft and wanted to talk to someone."
	),
	row(
		'd18',
		'disclosure',
		'none',
		'trap',
		'My health is fine, I just wanted to tell you I might be a few days late with a payment.'
	),
	row(
		'd19',
		'disclosure',
		'bereavement',
		'paraphrase',
		'We lost our baby last month and I just need you to know things might slip for a while.'
	),
	row(
		'd20',
		'disclosure',
		'job-loss',
		'paraphrase',
		'I was sacked on Friday, so I thought you should know money will be tight.'
	)
];
