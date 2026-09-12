import type { PackManifest } from '@craftabot/core';
import { bankControlMap } from './controls/rows.js';
import { bankServiceLines } from './lines/index.js';
import { FALLBACK, toldPlainly } from './incident.js';
import { CALIBRATION, DECK_WEIGHTS } from './calibration/index.js';

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
	/** The cited table the population draws from and the design-time weights the decks were built on (WP74, `66-…` §4.1). */
	calibrations: [CALIBRATION, DECK_WEIGHTS]
};

export default manifest;

export * from './model.js';
export { bankCase, type BankCaseOptions } from './generate/case.js';
export { CALIBRATION, DECK_WEIGHTS, impliedMarginal, perDrawRate } from './calibration/index.js';
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
/** WP97 (`89-STACKS.md` §3): a desk's guards as stacks, from the values its baseline's bricks are built from. */
export {
	deskStacks,
	DESK_SCREENING,
	CLASSIFIER_HOOKS,
	type DeskSafety,
	type DeskStacksOptions
} from './stacks.js';
