import type { BankExtra } from '@craftabot/pack-fs-bank';
import type { Outcome, ReasonCode, RiskRating, Screening } from './rules.js';

/**
 * **The desk's own state** (WP103, `95-FS-ONBOARDING.md` §4.2): the bank as
 * the lines read it plus where the journey has got to. Serialised into the
 * snapshot; never truth — the screening result reaches the snapshot only
 * once the desk has run the screening, and the verdict never does.
 */
export interface Decision {
	outcome: Outcome;
	reasons: ReasonCode[];
}

export interface OnboardingApplication {
	productKind: 'current' | 'savings';
	purpose: string;
	/** What the applicant gave, as the identity check compares it: the document's year and postcode when they match, the applicant's own when they do not. */
	given: { birthYear: number; postcode: string };
}

export interface OnboardingState {
	application: OnboardingApplication;
	/** The identity check has been run … */
	identityChecked: boolean;
	/** … and matched the document. */
	verified: boolean;
	screened: boolean;
	/** What the screening found, once run — on the desk, never to the applicant. */
	screening?: Screening;
	rating?: RiskRating;
	decision?: Decision;
	opened: boolean;
	welcomed: boolean;
}

export type OnboardingExtra = BankExtra & { onboarding: OnboardingState };

/** The one queue item. */
export const APPLICATION_ITEM = 'application';
/** The record ids the journey earns. */
export const SCREENING_RECORD = 'screening';
export const RISK_RECORD = 'risk-rating';
export const DOCUMENT_RECORD = 'identity-document';
