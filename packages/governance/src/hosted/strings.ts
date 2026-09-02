import type { ExternalOutcomeKind, FindingCategory } from '@craftabot/core';

/**
 * **What a hosted guard's verdict says** (`29-GUARD-SHELL.md` §4.4). The bot
 * reads a tripped reason back next tick, so every line is composed from a
 * closed vocabulary, never quoted off the wire (`25-…` §4.4). A vendor pack
 * may hand the shell its own `HostedStrings` — the Armour Brick does, so its
 * users keep the lines they know — and these are what the generic Guard
 * brick, and any vendor that ships none, use.
 */

export interface MatchedFinding {
	category: FindingCategory;
	vendorLabel: string;
	confidence?: 'low' | 'medium' | 'high';
	vendorConfidence?: string;
}

export interface HostedStrings {
	nothingToCheck: string;
	allClear: string;
	didNotFinish: string;
	transport(kind: ExternalOutcomeKind): string;
	/** e.g. "the guard spotted a sneaky instruction (very sure) and a secret". */
	match(matches: readonly MatchedFinding[]): string;
}

const CATEGORY_LABELS: Record<FindingCategory, string> = {
	injection: 'a sneaky instruction',
	jailbreak: 'an attempt to break the rules',
	harmful: 'something harmful',
	'sensitive-data': 'a secret',
	'malicious-link': 'a dangerous link',
	'policy-violation': 'something the policy forbids',
	other: 'something it did not like'
};

const CONFIDENCE_LABELS: Record<'low' | 'medium' | 'high', string> = {
	low: 'maybe',
	medium: 'fairly sure',
	high: 'very sure'
};

const TRANSPORT_REASON: Record<ExternalOutcomeKind, string> = {
	'bad-token': 'the guard could not check — the battery token was rejected',
	'no-permission': 'the guard could not check — this account is not allowed to use the guard',
	'no-template': 'the guard could not check — its policy could not be found',
	quota: 'the guard could not check — too many checks this minute',
	timeout: 'the guard could not check — it took too long to answer',
	unavailable: 'the guard could not check — it could not be reached'
};

export const defaultHostedStrings: HostedStrings = {
	nothingToCheck: 'nothing to check',
	allClear: 'guard ran — all clear',
	didNotFinish: 'the guard did not finish checking',
	transport: (kind) => TRANSPORT_REASON[kind],
	match: (matches) =>
		`the guard spotted ${joinWithAnd(
			matches.map((match) => {
				const label = CATEGORY_LABELS[match.category];
				return match.confidence !== undefined
					? `${label} (${CONFIDENCE_LABELS[match.confidence]})`
					: label;
			})
		)}`
};

export function joinWithAnd(parts: readonly string[]): string {
	if (parts.length === 0) return '';
	if (parts.length === 1) return String(parts[0]);
	return `${parts.slice(0, -1).join(', ')} and ${String(parts.at(-1))}`;
}
