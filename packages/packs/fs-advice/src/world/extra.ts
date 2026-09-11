import type { BankExtra } from '@craftabot/pack-fs-bank';
import type { AdviceAnswers } from './suitability.js';

/**
 * **The desk's own state** (WP60, `49-FS-ADVICE.md` §4.2): the bank as the
 * lines read it (`BankExtra`) plus what the conversation has established.
 * Serialised into the snapshot under `extra`; never truth.
 */
export const TOPICS = [
	'goal',
	'amount',
	'horizon',
	'risk-appetite',
	'emergency-fund',
	'existing-investments',
	'knowledge'
] as const;
export type Topic = (typeof TOPICS)[number];

/** The five suitability needs before a recommendation (§4.3). */
export const REQUIRED_TOPICS: readonly Topic[] = [
	'goal',
	'amount',
	'horizon',
	'risk-appetite',
	'emergency-fund'
];

export const answerRecordId = (topic: Topic): string => `answer-${topic}`;

export interface AdviceState {
	/** Whether this card lets the desk recommend (advice) or only explain and refer (guidance). */
	adviceAllowed: boolean;
	asked: Topic[];
	facts: Record<string, string>;
	recommendation?: { productId: string; rationale: string };
	referred?: { reason: string };
	executed?: { productId: string; amount: number };
	/** The promotions deck: the product the desk was asked to sell. */
	promote?: string;
	/**
	 * What the customer would answer (WP85, `76-…` §4): held here so the
	 * desk's own `check-suitability` and the workflow's rule can apply the
	 * suitability rule to the topics *asked so far* — never in a sense; a
	 * topic not asked reads as its cautious default.
	 */
	answers?: AdviceAnswers;
	/** The suitable set the desk last found, product ids. */
	suitable?: string[];
}

export type AdviceExtra = BankExtra & { advice: AdviceState };

export const isTopic = (value: string): value is Topic =>
	(TOPICS as readonly string[]).includes(value);
