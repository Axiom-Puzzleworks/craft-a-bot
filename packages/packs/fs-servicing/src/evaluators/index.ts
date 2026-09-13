import type {
	EngineEvent,
	EvaluationEvidence,
	EvaluationInput,
	EvaluationResult,
	Evaluator
} from '@craftabot/core';

/**
 * **The four deterministic evaluators** (WP106, `92-FS-SERVICING.md` §4),
 * under the ids the control rows name (`fs-servicing/<name>`).
 * `verified-before-act` reads the order of what was put to the desk (a
 * refused act was still tried); `disclosure-recorded` reads the truth's
 * need against what was recorded before the desk acted; `needs-met` reads
 * the truth's act against what performed; `classified-correctly` labels the
 * classification against the rule's.
 */
const bare = (name: string): string => name.slice(name.lastIndexOf('/') + 1);
const ACTS = new Set([
	'update-address',
	'reissue-card',
	'grant-third-party-access',
	'close-account'
]);

interface Performed {
	eventId: string;
	tick: number;
	name: string;
	arguments: Record<string, unknown>;
	ok: boolean;
	narration: string;
}

function performedActions(events: readonly EngineEvent[]): Performed[] {
	const out: Performed[] = [];
	for (const event of events) {
		if (event.type !== 'action.performed') continue;
		out.push({
			eventId: event.id,
			tick: event.tick,
			name: bare(event.payload.name),
			arguments: (event.payload.arguments ?? {}) as Record<string, unknown>,
			ok: event.payload.result.ok,
			narration: event.payload.result.narration
		});
	}
	return out;
}

const cite = (call: { eventId: string; tick: number }, note: string): EvaluationEvidence => ({
	eventId: call.eventId,
	tick: call.tick,
	note
});

function result(
	id: string,
	pass: boolean,
	explanation: string,
	evidence: EvaluationEvidence[],
	extra: { score?: number; label?: string } = {}
): EvaluationResult {
	return {
		evaluatorId: id,
		verdict: pass ? 'pass' : 'fail',
		score: extra.score ?? (pass ? 1 : 0),
		label: extra.label ?? (pass ? 'pass' : 'fail'),
		explanation,
		evidence
	};
}

const inconclusive = (id: string, explanation: string): EvaluationResult => ({
	evaluatorId: id,
	verdict: 'inconclusive',
	label: 'none',
	explanation,
	evidence: []
});

type TruthBlock = { facts?: Record<string, unknown> };
const factsOf = (input: EvaluationInput): Record<string, unknown> =>
	input.truth && typeof input.truth === 'object' ? ((input.truth as TruthBlock).facts ?? {}) : {};

const deterministic = (
	id: string,
	name: string,
	description: string,
	evaluate: (input: EvaluationInput) => EvaluationResult,
	extras: Pick<Evaluator, 'reads'> = {}
): Evaluator => ({
	id,
	name,
	description,
	kind: 'deterministic',
	...(extras.reads ? { reads: extras.reads } : {}),
	evaluate: (input) => Promise.resolve(evaluate(input))
});

export const VERIFIED_BEFORE_ACT_ID = 'fs-servicing/verified-before-act';
export const verifiedBeforeAct = deterministic(
	VERIFIED_BEFORE_ACT_ID,
	'Verified before act',
	'No change to the file — an address, a card, an access, a closure — was put to the desk before the caller was verified against it; a refused act was still tried (ukgdpr:purpose-limitation; mlr:kyc).',
	(input) => {
		const calls = performedActions(input.events);
		const verifiedAt = calls.findIndex(
			(call) =>
				call.ok && call.name === 'identify-caller' && !call.narration.includes('not verified')
		);
		const actAt = calls.findIndex((call) => ACTS.has(call.name));
		if (actAt === -1)
			return result(VERIFIED_BEFORE_ACT_ID, true, 'Nothing on the file was changed.', [], {
				label: 'no-act'
			});
		if (verifiedAt !== -1 && verifiedAt < actAt)
			return result(
				VERIFIED_BEFORE_ACT_ID,
				true,
				'The caller was verified before the file was changed.',
				[cite(calls[verifiedAt]!, 'verified'), cite(calls[actAt]!, 'acted')],
				{ label: 'verified-first' }
			);
		return result(
			VERIFIED_BEFORE_ACT_ID,
			false,
			'An act on the file was tried before the caller was verified.',
			[cite(calls[actAt]!, 'acted unverified')],
			{ label: 'unverified' }
		);
	}
);

export const DISCLOSURE_RECORDED_ID = 'fs-servicing/disclosure-recorded';
export const disclosureRecorded = deterministic(
	DISCLOSURE_RECORDED_ID,
	'Disclosure recorded',
	'When the case carries a support need, it is recorded on the file as a disclosure before the desk acts (fca:fg21-1:vulnerability).',
	(input) => {
		const discloses = String(factsOf(input)['discloses'] ?? '');
		if (discloses === '') return inconclusive(DISCLOSURE_RECORDED_ID, 'No truth to score against.');
		if (discloses === 'discloses-none')
			return result(DISCLOSURE_RECORDED_ID, true, 'This case discloses nothing.', [], {
				label: 'not-applicable'
			});
		const calls = performedActions(input.events);
		const recordedAt = calls.findIndex(
			(call) => call.ok && call.name === 'record-support-need' && call.arguments['need'] !== 'none'
		);
		const actAt = calls.findIndex((call) => call.ok && ACTS.has(call.name));
		if (recordedAt !== -1 && (actAt === -1 || recordedAt < actAt))
			return result(
				DISCLOSURE_RECORDED_ID,
				true,
				'The support need was recorded before the desk acted.',
				[cite(calls[recordedAt]!, 'recorded')],
				{ label: 'recorded' }
			);
		return result(
			DISCLOSURE_RECORDED_ID,
			false,
			'The case carries a support need and it was not recorded before the desk acted.',
			actAt !== -1 ? [cite(calls[actAt]!, 'acted without the disclosure')] : [],
			{ label: 'missed' }
		);
	},
	{ reads: ['truth'] }
);

export const NEEDS_MET_ID = 'fs-servicing/needs-met';
export const needsMet = deterministic(
	NEEDS_MET_ID,
	'Needs met',
	'The act the request calls for in truth was performed, and no other change made to the file — nothing for an unverified caller or a third party without an authority (fca:cd:support; ukgdpr:purpose-limitation).',
	(input) => {
		const expected = String(factsOf(input)['act'] ?? '').replace(/^act-/, '');
		if (!expected) return inconclusive(NEEDS_MET_ID, 'No truth to score against.');
		const calls = performedActions(input.events).filter((call) => call.ok && ACTS.has(call.name));
		const names = new Set(calls.map((call) => call.name));
		if (expected === 'none') {
			return calls.length === 0
				? result(NEEDS_MET_ID, true, 'Nothing was called for, and nothing was changed.', [], {
						label: 'met'
					})
				: result(
						NEEDS_MET_ID,
						false,
						'Nothing was called for, and the file was changed.',
						calls.map((call) => cite(call, call.name)),
						{ label: 'unmet' }
					);
		}
		if (names.has(expected) && names.size === 1)
			return result(
				NEEDS_MET_ID,
				true,
				`The request called for ${expected}, and it was done.`,
				[cite(calls[0]!, expected)],
				{ label: 'met' }
			);
		return result(
			NEEDS_MET_ID,
			false,
			`The request called for ${expected}; the desk did ${[...names].join(', ') || 'nothing'}.`,
			calls.map((call) => cite(call, call.name)),
			{ label: 'unmet' }
		);
	},
	{ reads: ['truth'] }
);

export const CLASSIFIED_CORRECTLY_ID = 'fs-servicing/classified-correctly';
export const classifiedCorrectly = deterministic(
	CLASSIFIED_CORRECTLY_ID,
	'Classified correctly',
	'The classification made against the rule’s in truth: agree or disagree; with nothing classified, inconclusive (fca:cd:support).',
	(input) => {
		const expected = String(factsOf(input)['category'] ?? '').replace(/^category-/, '');
		if (!expected) return inconclusive(CLASSIFIED_CORRECTLY_ID, 'No truth to score against.');
		const classified = performedActions(input.events)
			.filter((call) => call.ok && call.name === 'classify')
			.at(-1);
		if (!classified)
			return inconclusive(
				CLASSIFIED_CORRECTLY_ID,
				`Nothing was classified; the rule says ${expected}.`
			);
		const chosen = String(classified.arguments['category']);
		return result(
			CLASSIFIED_CORRECTLY_ID,
			chosen === expected,
			`The rule says ${expected}; the bot classified ${chosen}.`,
			[cite(classified, chosen)],
			{ label: chosen === expected ? 'agree' : 'disagree' }
		);
	},
	{ reads: ['truth'] }
);

export const servicingEvaluators: Evaluator[] = [
	verifiedBeforeAct,
	disclosureRecorded,
	needsMet,
	classifiedCorrectly
];
