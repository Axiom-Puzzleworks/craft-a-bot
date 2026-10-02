import { ukRetailBankingDomain } from './domain.js';
import { ATTACK_WORDS_READER, QUARANTINED_READER_COMPONENT } from './guard/attack-words.js';
import { POLICY_CONDITIONED_READER } from './guard/rulebook.js';
import { VULNERABILITY_DETECTION_COMPONENT, VULNERABILITY_READER } from './vulnerability.js';
import type { PackManifest } from '@craftabot/core';
import { bankControlMap } from './controls/rows.js';
import { bankServiceLines } from './lines/index.js';
import { FALLBACK, toldPlainly } from './incident.js';
import {
	BOOK_INCIDENCES,
	CALIBRATION,
	DECK_WEIGHTS,
	ERROR_RATES,
	REVIEWER_RATES,
	bankReviewerModels
} from './calibration/index.js';

/**
 * **`@craftabot/pack-fs-bank`** — the synthetic bank (WP59, `48-FS-BANK.md`;
 * `41-…` §6.5.1). Content only: generators, a product shelf, service lines
 * (stage B), a persona library, the obligation vocabulary and the control-map
 * rows. No runtime, no world, no brick kind — those are the desks' (WP60,
 * WP62, WP63), which depend on this pack. Every identifier is a synthetic
 * primitive's (hard rule 9); every case is deterministic from its seed.
 */
export const FS_BANK_PACK_ID = 'fs-bank';

const manifest: PackManifest = {
	id: FS_BANK_PACK_ID,
	name: 'The Bank (synthetic)',
	version: '1.0.0',
	requiresCore: '>=1.0.0',
	/** The Connector brick is the starter's; a line is fitted through it. */
	requiresPacks: { starter: '>=0.3.0' },
	/** The nine lines (`48-…` §4.5); the registry synthesises their tools under `fs-bank/connector_<line>_<op>`. */
	serviceLines: bankServiceLines,
	// The operational incident's two pieces (WP72, `61-…` §4.3): one card and one evaluator every desk gates on.
	policyCards: [FALLBACK],
	evaluators: [toldPlainly],
	/** The UK retail rows (WP67, `53-…` §4.1), every evidence id resolved by `checkControlMap`. */
	controlMaps: [bankControlMap],
	// WP106 stage A (`83-…` §6.6.1): the domain spec the journeys page and `checkDomainPack` read.
	domains: [ukRetailBankingDomain],
	/** The cited table the population draws from and the design-time weights the decks were built on (WP74, `66-…` §4.1). */
	calibrations: [CALIBRATION, DECK_WEIGHTS, BOOK_INCIDENCES, ERROR_RATES, REVIEWER_RATES],
	// WP115: the person at a review stage, as a model over REVIEWER_RATES.
	reviewerModels: bankReviewerModels,
	// WP122 (`106-BENCHMARK.md` §3): the guard question set's keyword baseline, frozen before any adversarial row.
	// WP143: the policy-conditioned classifier over the bank's written rulebook, beside the keyword baseline.
	readers: [ATTACK_WORDS_READER, POLICY_CONDITIONED_READER, VULNERABILITY_READER],
	// WP124 (`106-BENCHMARK.md` §8.3): the quarantined reader over the guard question set.
	// WP145: vulnerability detection, fitted at every desk's intake.
	guardrailComponents: [
		QUARANTINED_READER_COMPONENT as never,
		VULNERABILITY_DETECTION_COMPONENT as never
	]
};

export default manifest;

export * from './model.js';
export { bankCase, type BankCaseOptions } from './generate/case.js';
export {
	BOOK_INCIDENCES,
	CALIBRATION,
	CASE_HANDLER_REVIEWER_ID,
	DECK_WEIGHTS,
	ERROR_RATES,
	REVIEWER_RATES,
	bankReviewerModels,
	everyNth,
	impliedMarginal,
	perDrawRate
} from './calibration/index.js';
export { rateOf, weightedRow, type Calibrated } from './generate/customer.js';
export { generateCustomer } from './generate/customer.js';
export { generateAccounts, monthlyIncomeOf } from './generate/accounts.js';
export {
	dayTransactions,
	generateTransactions,
	type DayTransactions,
	type PlantedLabel
} from './generate/transactions.js';
export * from './book/index.js';
export {
	POPULATION_DEFAULTS,
	customerCase,
	marginalOf,
	population,
	populationDigest,
	sampleOrdinals,
	type Population,
	type PopulationCustomer,
	type PopulationOptions,
	type TransactionStream
} from './population/population.js';
export { accountDaySeed, customerSeed } from './population/seeds.js';
export { sha256Hex } from './population/sha256.js';
export { generateComplaints } from './generate/complaints.js';
export { generateBureau } from './generate/bureau.js';
export { SHELF, generateShelf } from './generate/shelf.js';
export { bankRecords, driverList, hasAnyDriver, type BankRecords } from './records.js';
export { customerForTheDesk } from './book/books.js';
// WP103 (`95-FS-ONBOARDING.md` §4.2): the synthetic screening lists the `kyc` line and the Onboarding Desk read.
export {
	SCREENING_LIST,
	SCREENING_READINGS,
	screenAgainstTheLists,
	type ScreeningEntry,
	type ScreeningList
} from './screening.js';
export {
	BANK_PURPOSES,
	bankExtra,
	bankExtraOf,
	emptyLedger,
	type BankExtra,
	type BankLedger,
	type BankPurpose
} from './extra.js';
export {
	bankServiceLineIds,
	bankServiceLines,
	complaintsLine,
	graphLine,
	coreBankingLine,
	creditBureauLine,
	crmLine,
	kycLine,
	lineStrings,
	mayRead,
	orderDeskLine,
	paymentsLine,
	productCatalogueLine,
	PURPOSE_ALLOWS_SPECIAL_CATEGORY,
	sarFilingLine
} from './lines/index.js';
export {
	PERSONA_IDS,
	bankPersonas,
	persona,
	type PersonaId,
	type PersonaOptions
} from './personas.js';
export { CONSUMER_DUTY_OUTCOMES, OBLIGATION_TAGS, isObligationTag } from './obligations.js';
export {
	ONTOLOGY_CLASSES,
	ONTOLOGY_RELATIONS,
	bankOntology,
	describeClass,
	knowledgeCard,
	neighbourhood,
	neighbours,
	pathBetween,
	type CardOptions,
	type Ontology,
	type OntologyClass,
	type OntologyEdge,
	type OntologyInstance,
	type OntologyRelation,
	type OntologyScope
} from './ontology.js';
export { KNOWLEDGE_CARD_RECORD, bankContextRecords } from './context.js';
export {
	ADVICE_SAVINGS_THRESHOLD,
	adviceRequestBook,
	complaintBook,
	type AdviceRequestItemPayload,
	type ComplaintItemPayload,
	type RegisterOptions
} from './book/registers.js';
export {
	arrivals,
	bankClock,
	defaultArrivalRates,
	hourProfileOf,
	itemSeed,
	type Arrival,
	type ArrivalRates,
	type ClockOptions,
	type HourProfile,
	type KindRate
} from './clock.js';
export {
	BANK_CONTROL_ROWS,
	bankControlMap,
	type ControlEvidenceKind,
	type ControlMapRow
} from './controls/rows.js';
export {
	FALLBACK,
	FALLBACK_CARD_ID,
	PLAIN_UNAVAILABLE,
	PLAIN_WORDS_PATTERN,
	TOLD_PLAINLY_ID,
	toldPlainly
} from './incident.js';
/** WP137 (`110-…` §6): a card that holds a journey's irreversible stage until the desk's case file shows its preconditions. */
export { DESK_READER_LINE, stageGateCard, type StageGateInput } from './stage-gate.js';
/** WP97 (`89-STACKS.md` §3): a desk's guards as stacks, from the values its baseline's bricks are built from. */
export {
	HOSTED_GUARD_STAND_IN,
	deskStacks,
	DESK_SCREENING,
	CLASSIFIER_HOOKS,
	type DeskSafety,
	type DeskStacksOptions
} from './stacks.js';
export { UK_RETAIL_BANKING_DOMAIN_ID, ukRetailBankingDomain } from './domain.js';
export {
	ATTACK_KIND_QUESTION,
	ATTACK_QUESTION,
	ATTACK_WORDS_READER,
	ATTACK_WORDS_READER_ID,
	QUARANTINED_READER_COMPONENT,
	QUARANTINED_READER_COMPONENT_ID,
	GUARD_QUESTIONS,
	GUARD_QUESTION_SET_DIGEST,
	GUARD_QUESTION_SET_ID,
	attackKindOf
} from './guard/attack-words.js';
export { BANK_ADVERSARIAL_BENCHMARK } from './guard/benchmark.js';
export {
	BANK_RULEBOOK,
	POLICY_CONDITIONED_MODEL,
	POLICY_CONDITIONED_READER,
	POLICY_CONDITIONED_READER_ID
} from './guard/rulebook.js';
export { APPEAL_REVIEW_JOURNEY, appealHandoff, type AppealInput } from './appeal.js';
export {
	DISCLOSURES,
	disclose,
	discloseOnce,
	disclosed,
	disclosureDigest,
	disclosureMadeEvaluator,
	type Disclosure,
	type PerformedCall,
	type DisclosureId
} from './disclosures.js';
export {
	SUPPORT_NEED_DISCLOSED_QUESTION,
	VULNERABILITY_AT_THE_DOOR,
	VULNERABILITY_DETECTION_COMPONENT,
	VULNERABILITY_DETECTION_ID,
	VULNERABILITY_READER,
	VULNERABILITY_READER_ID,
	customerWordsIn,
	supportNeedIn,
	type SupportNeed
} from './vulnerability.js';
