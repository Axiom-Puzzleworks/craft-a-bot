/**
 * **The obligation vocabulary** (WP59 stage B, `48-FS-BANK.md` §4.7; `41-…`
 * §6.5.1): the tags every desk's scenarios, cards and evaluators carry, so
 * a report and an assurance pack can group by them. Plain strings with a
 * plain-English gloss, reviewed by a compliance reader, never interpreted
 * by code beyond grouping. A source is named as a source; none of this is
 * a claim of compliance.
 */
export const OBLIGATION_TAGS: Readonly<Record<string, string>> = {
	'fca:cd:products-services':
		'Consumer Duty, products and services outcome: what is sold fits the customers it is designed for.',
	'fca:cd:price-value':
		'Consumer Duty, price and value outcome: the price is fair for what the customer gets.',
	'fca:cd:understanding':
		'Consumer Duty, consumer understanding outcome: explanations a customer can actually follow.',
	'fca:cd:support':
		'Consumer Duty, consumer support outcome: help that meets the customer’s needs, including under pressure.',
	'fca:cobs-9:suitability':
		'COBS 9: advice rests on what suitability requires — the customer’s goals, means and knowledge.',
	'fca:cobs-4:promotions':
		'COBS 4: promotions are fair, clear and not misleading, with the warnings prominent.',
	'fca:conc:affordability': 'CONC: a lending decision rests on whether the customer can afford it.',
	'fca:conc:creditworthiness':
		'CONC: the customer’s credit standing is assessed before a decision.',
	'fca:disp:complaints':
		'DISP: complaints acknowledged, investigated and answered within the timescales.',
	'fca:fg21-1:vulnerability': 'FG21/1: vulnerability recognised and acted on; support needs met.',
	'pra:ss1-23:identification':
		'SS1/23 principle 1: every model identified and classified — an inventory entry.',
	'pra:ss1-23:governance':
		'SS1/23 principle 2: governance, with accountable people and recorded decisions.',
	'pra:ss1-23:development':
		'SS1/23 principle 3: development, implementation and use are tested and evidenced.',
	'pra:ss1-23:validation': 'SS1/23 principle 4: independent validation before and during use.',
	'pra:ss1-23:mitigants': 'SS1/23 principle 5: risk mitigants where a model is uncertain or weak.',
	'pra:ss1-21:resilience':
		'SS1/21: important services keep working, or fail safely, under disruption.',
	'poca:tipping-off':
		'POCA: never tell a customer that a suspicious-activity report has been made about them.',
	'mlr:kyc':
		'Money Laundering Regulations: identity verified before an account is used or money moved.',
	'ukgdpr:data-minimisation': 'UK GDPR: only the data the purpose needs is read or kept.',
	'ukgdpr:purpose-limitation': 'UK GDPR: data used only for the purpose it was collected for.',
	'equality-act:fairness':
		'Equality Act 2010: outcomes compared across groups; no worse treatment by a protected characteristic.'
};

export const isObligationTag = (tag: string): boolean => tag in OBLIGATION_TAGS;

/** The `fca:cd:*` four, in the Consumer Duty's order — the report's first grouping. */
export const CONSUMER_DUTY_OUTCOMES = [
	'fca:cd:products-services',
	'fca:cd:price-value',
	'fca:cd:understanding',
	'fca:cd:support'
] as const;
