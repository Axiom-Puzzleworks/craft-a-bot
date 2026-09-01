import { z } from 'zod';

/**
 * Parses a Model Armor `sanitizeUserPrompt`/`sanitizeModelResponse` response
 * (`25-…` §4.1's envelope) into the flat `ArmorReading` shape the guardrails
 * and the fixtures share (`25-…` §4.4).
 *
 * Two rules are load-bearing here, straight from the design doc:
 *
 * - A filter that did not run (`EXECUTION_SKIPPED`) reads as `ran: false`,
 *   never folded into "clean" — `guardrails.ts` is the one that decides what
 *   an unknown filter means for the verdict (`outcome: 'partial'` with
 *   nothing fired goes to the `onFailure` dial), this module only reports it.
 * - `redactedText` is carried through when a `deidentifyResult` supplies one,
 *   but nothing here or in the guardrail *uses* it to replace what the bot
 *   said — that would be a mutation a guardrail may not perform (`08-…` §2),
 *   logged as a non-goal in `25-…` §7.
 *
 * The wire shape beyond what `25-…` §4.1 spells out (the RAI sub-filter and
 * `malicious_uris`/`csam` result field names) is a best-effort reconstruction
 * consistent with that envelope; `25-…` §8's platform-drift risk expects a
 * fixture, not a running system, to be what breaks if it is wrong.
 */

const executionStateSchema = z.enum(['EXECUTION_SUCCESS', 'EXECUTION_SKIPPED']);
const matchStateSchema = z.enum(['MATCH_FOUND', 'NO_MATCH_FOUND']);
const confidenceSchema = z.enum(['LOW_AND_ABOVE', 'MEDIUM_AND_ABOVE', 'HIGH']);

const simpleFilterResultSchema = z.object({
	executionState: executionStateSchema,
	matchState: matchStateSchema
});

const piAndJailbreakFilterResultSchema = simpleFilterResultSchema.extend({
	confidenceLevel: confidenceSchema.optional()
});

const raiFilterTypeResultSchema = z.object({ matchState: matchStateSchema });

const raiFilterResultSchema = simpleFilterResultSchema.extend({
	raiFilterTypeResults: z
		.object({
			HATE_SPEECH: raiFilterTypeResultSchema.optional(),
			HARASSMENT: raiFilterTypeResultSchema.optional(),
			DANGEROUS: raiFilterTypeResultSchema.optional(),
			SEXUALLY_EXPLICIT: raiFilterTypeResultSchema.optional()
		})
		.optional()
});

const sdpDeidentifyResultSchema = simpleFilterResultSchema.extend({
	data: z.object({ text: z.string() }).optional()
});

const sdpFilterResultSchema = z.object({
	inspectResult: simpleFilterResultSchema.optional(),
	deidentifyResult: sdpDeidentifyResultSchema.optional()
});

const filterResultsSchema = z.object({
	pi_and_jailbreak: z
		.object({ piAndJailbreakFilterResult: piAndJailbreakFilterResultSchema })
		.optional(),
	rai: z.object({ raiFilterResult: raiFilterResultSchema }).optional(),
	sdp: z.object({ sdpFilterResult: sdpFilterResultSchema }).optional(),
	malicious_uris: z.object({ maliciousUriFilterResult: simpleFilterResultSchema }).optional(),
	csam: z.object({ csamFilterResult: simpleFilterResultSchema }).optional()
});

export const sanitizationResponseSchema = z.object({
	sanitizationResult: z.object({
		filterMatchState: matchStateSchema,
		invocationResult: z.enum(['SUCCESS', 'PARTIAL', 'FAILURE']),
		filterResults: filterResultsSchema.optional(),
		sanitizationMetadata: z
			.object({
				errorCode: z.union([z.string(), z.number()]).optional(),
				errorMessage: z.string().optional()
			})
			.optional()
	})
});

export type ArmorFilterKey =
	| 'injection'
	| 'hate'
	| 'harassment'
	| 'dangerous'
	| 'sexual'
	| 'sensitiveData'
	| 'maliciousUri'
	| 'csam';

export interface ArmorFilterReading {
	ran: boolean;
	matched: boolean;
	confidence?: 'LOW_AND_ABOVE' | 'MEDIUM_AND_ABOVE' | 'HIGH';
}

export interface ArmorReading {
	outcome: 'ok' | 'partial' | 'failure';
	matched: boolean;
	filters: Record<ArmorFilterKey, ArmorFilterReading>;
	redactedText?: string;
}

const OUTCOME_BY_INVOCATION: Record<'SUCCESS' | 'PARTIAL' | 'FAILURE', ArmorReading['outcome']> = {
	SUCCESS: 'ok',
	PARTIAL: 'partial',
	FAILURE: 'failure'
};

const NOT_RUN: ArmorFilterReading = { ran: false, matched: false };

function raiSubFilter(
	type: { matchState: z.infer<typeof matchStateSchema> } | undefined,
	parent: { executionState: z.infer<typeof executionStateSchema> } | undefined
): ArmorFilterReading {
	if (!parent) return NOT_RUN;
	return {
		ran: parent.executionState === 'EXECUTION_SUCCESS',
		matched: type?.matchState === 'MATCH_FOUND'
	};
}

function plainFilter(
	result:
		| {
				executionState: z.infer<typeof executionStateSchema>;
				matchState: z.infer<typeof matchStateSchema>;
		  }
		| undefined
): ArmorFilterReading {
	if (!result) return NOT_RUN;
	return {
		ran: result.executionState === 'EXECUTION_SUCCESS',
		matched: result.matchState === 'MATCH_FOUND'
	};
}

/** Parses a raw sanitize-call response body into an `ArmorReading`. Throws if the envelope does not match. */
export function readSanitizationResult(raw: unknown): ArmorReading {
	const { sanitizationResult } = sanitizationResponseSchema.parse(raw);
	const filterResults = sanitizationResult.filterResults ?? {};

	const injection = filterResults.pi_and_jailbreak?.piAndJailbreakFilterResult;
	const rai = filterResults.rai?.raiFilterResult;
	const raiTypes = rai?.raiFilterTypeResults ?? {};
	const sdp = filterResults.sdp?.sdpFilterResult;
	const sdpResult = sdp?.deidentifyResult ?? sdp?.inspectResult;

	const filters: Record<ArmorFilterKey, ArmorFilterReading> = {
		injection: injection
			? {
					ran: injection.executionState === 'EXECUTION_SUCCESS',
					matched: injection.matchState === 'MATCH_FOUND',
					...(injection.confidenceLevel !== undefined
						? { confidence: injection.confidenceLevel }
						: {})
				}
			: NOT_RUN,
		hate: raiSubFilter(raiTypes.HATE_SPEECH, rai),
		harassment: raiSubFilter(raiTypes.HARASSMENT, rai),
		dangerous: raiSubFilter(raiTypes.DANGEROUS, rai),
		sexual: raiSubFilter(raiTypes.SEXUALLY_EXPLICIT, rai),
		sensitiveData: plainFilter(sdpResult),
		maliciousUri: plainFilter(filterResults.malicious_uris?.maliciousUriFilterResult),
		csam: plainFilter(filterResults.csam?.csamFilterResult)
	};

	return {
		outcome: OUTCOME_BY_INVOCATION[sanitizationResult.invocationResult],
		matched: sanitizationResult.filterMatchState === 'MATCH_FOUND',
		filters,
		...(sdp?.deidentifyResult?.data?.text !== undefined
			? { redactedText: sdp.deidentifyResult.data.text }
			: {})
	};
}
