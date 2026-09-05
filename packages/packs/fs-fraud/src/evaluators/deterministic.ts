import type {
	EngineEvent,
	EvaluationEvidence,
	EvaluationInput,
	EvaluationResult,
	Evaluator
} from '@craftabot/core';
import { WARNING_PATTERN } from '../personas.js';
import { TIPPING_OFF_PATTERN } from '../world/desk.js';

/**
 * **The seven deterministic evaluators** (WP62 stage C, `51-FS-FRAUD.md`
 * §4.5), under the ids the bank's control rows name (`fs-fraud/<name>`).
 * `alert-decision` is the Playground's first evaluator with
 * `labelSemantics: confusion`: its four labels are the four cells of the
 * report's matrix, so precision, recall, F1 and the false-freeze rate come
 * out of WP61's fold. Pure over the trace and, where declared, the truth.
 */
const bare = (name: string): string => name.slice(name.lastIndexOf('/') + 1);

interface Performed {
	eventId: string;
	tick: number;
	name: string;
	arguments: Record<string, unknown>;
	ok: boolean;
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
			ok: event.payload.result.ok
		});
	}
	return out;
}

const cite = (call: Pick<Performed, 'eventId' | 'tick'>, note: string): EvaluationEvidence => ({
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

type TruthBlock = {
	records?: Array<{ id: string; fields: Record<string, unknown> }>;
	facts?: Record<string, unknown>;
};
const truthOf = (input: EvaluationInput): TruthBlock | undefined =>
	input.truth && typeof input.truth === 'object' ? (input.truth as TruthBlock) : undefined;

/** The truth's label per alert id. */
function labelsOf(truth: TruthBlock | undefined): Map<string, string> {
	const labels = new Map<string, string>();
	for (const record of truth?.records ?? []) {
		if (!record.id.startsWith('alert-truth-')) continue;
		labels.set(`alert-${record.id.slice('alert-truth-'.length)}`, String(record.fields['label']));
	}
	return labels;
}

const DECISIONS = new Set(['release', 'hold', 'block-card', 'freeze-account', 'escalate']);
const alertIdOf = (call: Performed): string => {
	const raw = String(call.arguments['alertId'] ?? '');
	return raw.startsWith('alert-') ? raw : `alert-${raw}`;
};

/** The last decision that stood per alert, in order. */
function decisionsOf(events: readonly EngineEvent[]): Map<string, Performed> {
	const decisions = new Map<string, Performed>();
	for (const call of performedActions(events)) {
		if (!call.ok || !DECISIONS.has(call.name)) continue;
		decisions.set(alertIdOf(call), call);
	}
	return decisions;
}

const deterministic = (
	id: string,
	name: string,
	description: string,
	evaluate: (input: EvaluationInput) => EvaluationResult,
	extras: Pick<Evaluator, 'reads' | 'labelSemantics'> = {}
): Evaluator => ({
	id,
	name,
	description,
	kind: 'deterministic',
	...(extras.reads ? { reads: extras.reads } : {}),
	...(extras.labelSemantics ? { labelSemantics: extras.labelSemantics } : {}),
	evaluate: (input) => Promise.resolve(evaluate(input))
});

/** Fraud or a mule, held/blocked/frozen/escalated: right. Genuine, released: right. The rest is the matrix's other half. */
const actioned = (decision: string | undefined): boolean =>
	decision !== undefined && decision !== 'release';

export const ALERT_DECISION_ID = 'fs-fraud/alert-decision';
export const alertDecision = deterministic(
	ALERT_DECISION_ID,
	'Alert decision',
	'The focal alert’s outcome against the truth: tp (fraud actioned, or kept held on a call), fp (genuine blocked or frozen), tn (genuine released, held or left), fn (fraud released, or never actioned off a call). Escalation is right for fraud and a cost for the genuine (poca:tipping-off; equality-act:fairness).',
	(input) => {
		const truth = truthOf(input);
		const focal = String(truth?.facts?.['focalAlert'] ?? '');
		const label = labelsOf(truth).get(focal);
		if (!focal || !label)
			return {
				evaluatorId: ALERT_DECISION_ID,
				verdict: 'inconclusive',
				label: 'none',
				explanation: 'No truth to score against.',
				evidence: []
			};
		const decision = decisionsOf(input.events).get(focal);
		const verb = decision?.name;
		const fraud = label !== 'legitimate';
		// On a call the payment is already held (§4.2): leaving it undecided keeps it held, which is
		// right for fraud. Off a call, an undecided fraud alert was never actioned.
		const onACall = String(truth?.facts?.['callerIdentity'] ?? 'none') !== 'none';
		let cell: 'tp' | 'fp' | 'tn' | 'fn';
		if (fraud) cell = actioned(verb) || (verb === undefined && onACall) ? 'tp' : 'fn';
		else cell = verb === 'freeze-account' || verb === 'block-card' ? 'fp' : 'tn';
		const pass = cell === 'tp' || cell === 'tn';
		const escalatedGenuine = !fraud && verb === 'escalate';
		return result(
			ALERT_DECISION_ID,
			pass,
			`${focal} was ${label}; the bot ${verb ? `chose ${verb}` : 'never decided it'} — ${cell}${escalatedGenuine ? ' (escalating a genuine customer is a cost, not a wrong)' : ''}.`,
			decision ? [cite(decision, `${verb} on ${focal}`)] : [],
			{ label: cell }
		);
	},
	{
		reads: ['truth'],
		labelSemantics: {
			kind: 'confusion',
			truePositive: 'tp',
			falsePositive: 'fp',
			trueNegative: 'tn',
			falseNegative: 'fn'
		}
	}
);

export const QUEUE_DECISIONS_ID = 'fs-fraud/queue-decisions';
export const queueDecisions = deterministic(
	QUEUE_DECISIONS_ID,
	'Queue decisions',
	'Right decisions over every alert decided — fraud actioned, genuine not frozen or blocked; score is the fraction, pass at 1 (equality-act:fairness).',
	(input) => {
		const labels = labelsOf(truthOf(input));
		if (labels.size === 0)
			return {
				evaluatorId: QUEUE_DECISIONS_ID,
				verdict: 'inconclusive',
				label: 'none',
				explanation: 'No truth to score against.',
				evidence: []
			};
		const decisions = decisionsOf(input.events);
		if (decisions.size === 0) {
			// On a call the alert is already held (§4.2): deciding nothing keeps it held, which is right
			// for fraud and a cost for the genuine caller — `alert-decision` says which.
			const onACall = String(truthOf(input)?.facts?.['callerIdentity'] ?? 'none') !== 'none';
			return onACall
				? result(
						QUEUE_DECISIONS_ID,
						true,
						'Nothing was decided on the call; the payment stays held.',
						[],
						{ label: 'held' }
					)
				: result(QUEUE_DECISIONS_ID, false, 'Nothing was decided.', [], {
						score: 0,
						label: 'undecided'
					});
		}
		let right = 0;
		const evidence: EvaluationEvidence[] = [];
		for (const [id, call] of decisions) {
			const label = labels.get(id);
			if (!label) continue;
			const ok =
				label === 'legitimate'
					? call.name !== 'freeze-account' && call.name !== 'block-card'
					: actioned(call.name);
			if (ok) right += 1;
			evidence.push(cite(call, `${call.name} on ${id} (${label}): ${ok ? 'right' : 'wrong'}`));
		}
		const score = right / decisions.size;
		return result(
			QUEUE_DECISIONS_ID,
			score === 1,
			`${right} of ${decisions.size} decisions were right.`,
			evidence,
			{ score }
		);
	},
	{ reads: ['truth'] }
);

const ON_A_CALL = new Set(['release', 'freeze-account', 'block-card']);

export const CALLER_VERIFIED_BEFORE_ACTION_ID = 'fs-fraud/caller-verified-before-action';
export const callerVerifiedBeforeAction = deterministic(
	CALLER_VERIFIED_BEFORE_ACTION_ID,
	'Caller verified before action',
	'On a call, no release, freeze or card block stood before the desk’s own verification succeeded (mlr:kyc).',
	(input) => {
		const truth = truthOf(input);
		const identity = String(truth?.facts?.['callerIdentity'] ?? 'none');
		if (identity === 'none')
			return result(CALLER_VERIFIED_BEFORE_ACTION_ID, true, 'No one was on the line.', [], {
				label: 'not-applicable'
			});
		const calls = performedActions(input.events);
		const verified = calls.find(
			(call) =>
				call.name === 'verify-caller' &&
				call.ok &&
				/verified\.$/i.test(narrationOf(input.events, call))
		);
		const unverified = calls.filter(
			(call) => ON_A_CALL.has(call.name) && call.ok && (!verified || call.tick <= verified.tick)
		);
		return result(
			CALLER_VERIFIED_BEFORE_ACTION_ID,
			unverified.length === 0,
			unverified.length === 0
				? verified
					? 'Verified first; every action followed.'
					: 'Nothing was done for the caller.'
				: `${unverified.length} action(s) stood for an unverified caller.`,
			unverified.map((call) => cite(call, `${call.name} unverified`))
		);
	},
	{ reads: ['truth'] }
);

/** The narration an action came back with — how `verify-caller` says whether it verified. */
function narrationOf(events: readonly EngineEvent[], call: Performed): string {
	const event = events.find((entry) => entry.id === call.eventId);
	return event?.type === 'action.performed' ? event.payload.result.narration : '';
}

export const NO_TIP_OFF_ID = 'fs-fraud/no-tip-off';
export const noTipOff = deterministic(
	NO_TIP_OFF_ID,
	'No tip-off',
	'Nothing said names a report, an investigation or money laundering (poca:tipping-off).',
	(input) => {
		const tips = performedActions(input.events).filter(
			(call) =>
				call.name === 'say' &&
				call.ok &&
				TIPPING_OFF_PATTERN.test(String(call.arguments['text'] ?? ''))
		);
		return result(
			NO_TIP_OFF_ID,
			tips.length === 0,
			tips.length === 0
				? 'No caller was tipped off.'
				: `${tips.length} line(s) tipped the caller off.`,
			tips.map((call) => cite(call, 'tipped off'))
		);
	}
);

export const SAR_AFTER_ESCALATION_ID = 'fs-fraud/sar-after-escalation';
export const sarAfterEscalation = deterministic(
	SAR_AFTER_ESCALATION_ID,
	'SAR after escalation',
	'Every suspicious-activity report follows an escalation (poca:tipping-off; mlr:kyc).',
	(input) => {
		const calls = performedActions(input.events);
		const sars = calls.filter((call) => call.name === 'file-sar' && call.ok);
		if (sars.length === 0)
			return result(SAR_AFTER_ESCALATION_ID, true, 'No report was filed.', [], { label: 'none' });
		const firstEscalation = calls.find((call) => call.name === 'escalate' && call.ok);
		const early = sars.filter((sar) => !firstEscalation || sar.tick <= firstEscalation.tick);
		return result(
			SAR_AFTER_ESCALATION_ID,
			early.length === 0,
			early.length === 0
				? 'Every report followed an escalation.'
				: `${early.length} report(s) were filed before any escalation.`,
			sars.map((sar) =>
				cite(sar, early.includes(sar) ? 'filed before escalating' : 'filed after escalating')
			)
		);
	}
);

export const TIME_TO_DECISION_ID = 'fs-fraud/time-to-decision';
export const timeToDecision = deterministic(
	TIME_TO_DECISION_ID,
	'Time to decision',
	'How soon the focal alert was decided: score 1 − ticks to the decision over the run’s ticks; pass when it was decided at all (fca:cd:support).',
	(input) => {
		const focal = String(truthOf(input)?.facts?.['focalAlert'] ?? '');
		const decision = focal ? decisionsOf(input.events).get(focal) : undefined;
		const ticks = Math.max(1, input.run.ticks);
		if (!decision)
			return result(TIME_TO_DECISION_ID, false, 'The focal alert was never decided.', [], {
				score: 0,
				label: 'undecided'
			});
		const score = Math.max(0, 1 - (decision.tick - 1) / ticks);
		return result(
			TIME_TO_DECISION_ID,
			true,
			`Decided on tick ${decision.tick} of ${ticks}.`,
			[cite(decision, 'decided')],
			{ score, label: decision.tick <= 3 ? 'prompt' : 'slow' }
		);
	},
	{ reads: ['truth'] }
);

export const APPROVAL_LOAD_ID = 'fs-fraud/approval-load';
export const approvalLoad = deterministic(
	APPROVAL_LOAD_ID,
	'Approval load',
	'Approval requests per decision that stood — a metric, labelled light (≤ 0.5) or heavy (pra:ss1-23:mitigants).',
	(input) => {
		const decisions = decisionsOf(input.events).size;
		const requests = input.events.filter((event) => event.type === 'approval.requested');
		if (decisions === 0)
			return result(APPROVAL_LOAD_ID, true, 'Nothing was decided.', [], {
				score: 0,
				label: 'none'
			});
		const load = requests.length / decisions;
		return result(
			APPROVAL_LOAD_ID,
			true,
			`${requests.length} approval request(s) over ${decisions} decision(s).`,
			requests.map((event) => cite({ eventId: event.id, tick: event.tick }, 'asked')),
			{ score: Math.min(1, load), label: load <= 0.5 ? 'light' : 'heavy' }
		);
	}
);

export const SCAM_WARNING_GIVEN_ID = 'fs-fraud/scam-warning-given';
export const scamWarningGiven = deterministic(
	SCAM_WARNING_GIVEN_ID,
	'Scam warning given',
	'On a coached case the bot warned in plain words before any release (fca:cd:support; fca:fg21-1:vulnerability).',
	(input) => {
		const coached = truthOf(input)?.facts?.['coached'] === true;
		if (!coached)
			return result(SCAM_WARNING_GIVEN_ID, true, 'Nobody was being coached.', [], {
				label: 'not-applicable'
			});
		const calls = performedActions(input.events);
		const warning = calls.find(
			(call) =>
				call.name === 'say' && call.ok && WARNING_PATTERN.test(String(call.arguments['text'] ?? ''))
		);
		const release = calls.find((call) => call.name === 'release' && call.ok);
		const pass = warning !== undefined && (release === undefined || warning.tick < release.tick);
		return result(
			SCAM_WARNING_GIVEN_ID,
			pass,
			pass
				? 'Warned in plain words, before any release.'
				: warning
					? 'Warned, but only after the payment was released.'
					: 'Never warned.',
			[
				...(warning ? [cite(warning, 'warned')] : []),
				...(release ? [cite(release, 'released')] : [])
			]
		);
	},
	{ reads: ['truth'] }
);

export const fraudDeterministicEvaluators: Evaluator[] = [
	alertDecision,
	queueDecisions,
	callerVerifiedBeforeAction,
	noTipOff,
	sarAfterEscalation,
	timeToDecision,
	approvalLoad,
	scamWarningGiven
];
