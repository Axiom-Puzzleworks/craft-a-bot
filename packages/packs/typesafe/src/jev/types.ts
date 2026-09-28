/**
 * **Jev's wire shapes** (`98-JEV.md` §2–§3): TypeSafe's System One endpoint,
 * `POST https://api.typesafe.ai/v1/systemone` — a state, a map of typed
 * questions, one typed answer per question. Written from the public API
 * reference (read 2026-09-28) rather than taken from `@typesafe-ai/sdk`, so
 * the pack adds no dependency and every call goes through the session's
 * egress-guarded `fetch`.
 */
export interface JevNoul {
	type: 'noul';
	instructions: unknown;
	criteria?: { true?: unknown; false?: unknown };
}

export interface JevChoice<K extends string = string> {
	type: 'choice';
	instructions: unknown;
	/** At most 255 options. */
	criteria: Record<K, unknown>;
}

export interface JevScore {
	type: 'score';
	instructions: unknown;
	/** Two to ten ordered levels. */
	criteria: unknown[];
}

export type JevQuestion = JevNoul | JevChoice | JevScore;

export interface JevRequest {
	model: string;
	state: unknown;
	questions: Record<string, JevQuestion>;
}

export interface JevNoulAnswer {
	type: 'noul';
	noul: number;
}

export interface JevChoiceAnswer {
	type: 'choice';
	choice: string;
	probabilities: Record<string, number>;
	confidence: number;
}

export interface JevScoreAnswer {
	type: 'score';
	score: number;
	legend: Record<string, string>;
	probabilities: Record<string, number>;
	confidence: number;
}

export type JevAnswer = JevNoulAnswer | JevChoiceAnswer | JevScoreAnswer;

export interface JevResponse {
	/** The versioned id that answered: `jev-1.13.0`. */
	model: string;
	answers: Record<string, JevAnswer>;
	usage: { input_tokens: number; output_tokens: number };
}
