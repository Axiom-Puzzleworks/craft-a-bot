/**
 * **The obligation vocabulary** — every tag a journey, a card, an evaluator
 * or a control row may carry, with a gloss. Scaffolded with three; a real
 * domain names its regulator's and its guidance's, and the glossary in
 * `domain.ts` says them in both registers.
 */
export const OBLIGATION_TAGS: Readonly<Record<string, string>> = {
	'veterinary-practice:record-keeping': 'A record of what was done, by whom, and why — kept.',
	'veterinary-practice:consent': 'Nothing done to or for a patient without their say.',
	'veterinary-practice:fair-treatment':
		'Every patient treated as the rules treat them, whoever they are.'
};
