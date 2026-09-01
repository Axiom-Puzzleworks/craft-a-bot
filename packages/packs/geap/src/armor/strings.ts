import type { ArmorErrorKind } from './errors.js';
import type { ArmorFilterKey } from './reading.js';

/**
 * Every user-facing line the Armour Brick's guardrails produce, composed
 * here rather than from response JSON — the bot reads a tripped reason back
 * next tick, so it must be built from a closed vocabulary, never quoted
 * verbatim off the wire (`25-…` §4.4).
 */

export const NOTHING_TO_CHECK = 'nothing to check';
export const ALL_CLEAR_NOTE = 'guard ran: tricks, harmful, secrets, links — all clear';
export const GUARD_DID_NOT_FINISH = 'the guard did not finish checking';

const FILTER_LABELS: Record<ArmorFilterKey, string> = {
	injection: 'a sneaky instruction',
	hate: 'hateful language',
	harassment: 'harassing language',
	dangerous: 'something dangerous',
	sexual: 'sexual content',
	sensitiveData: 'a secret',
	maliciousUri: 'a dangerous link',
	csam: 'content that must always be stopped'
};

const CONFIDENCE_LABELS: Record<'LOW_AND_ABOVE' | 'MEDIUM_AND_ABOVE' | 'HIGH', string> = {
	LOW_AND_ABOVE: 'maybe',
	MEDIUM_AND_ABOVE: 'fairly sure',
	HIGH: 'very sure'
};

const TRANSPORT_REASON: Record<ArmorErrorKind, string> = {
	'bad-token': 'the guard could not check — the battery token was rejected',
	'no-permission': 'the guard could not check — this project is not allowed to use the guard',
	'no-template': 'the guard could not check — the template could not be found',
	quota: 'the guard could not check — too many checks this minute',
	timeout: 'the guard could not check — it took too long to answer',
	unavailable: 'the guard could not check — it could not be reached'
};

export interface MatchedFilter {
	key: ArmorFilterKey;
	confidence?: 'LOW_AND_ABOVE' | 'MEDIUM_AND_ABOVE' | 'HIGH';
}

/** e.g. "the guard spotted a sneaky instruction (very sure) and a secret" — the exact shape `25-…` §4.4 names. */
export function composeMatchReason(matches: readonly MatchedFilter[]): string {
	const parts = matches.map((match) => {
		const label = FILTER_LABELS[match.key];
		return match.confidence !== undefined
			? `${label} (${CONFIDENCE_LABELS[match.confidence]})`
			: label;
	});
	return `the guard spotted ${joinWithAnd(parts)}`;
}

export function transportReason(kind: ArmorErrorKind): string {
	return TRANSPORT_REASON[kind];
}

function joinWithAnd(parts: readonly string[]): string {
	if (parts.length === 0) return '';
	if (parts.length === 1) return parts[0] ?? '';
	return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1] ?? ''}`;
}
