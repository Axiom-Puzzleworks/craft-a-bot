import type { EngineEvent, EventType } from '@craftabot/core';

/**
 * Trace rows are colour-coded by brick (03-UI-UX-DESIGN.md §5.2) using the
 * fixed colour↔concept mapping from 04 §2.2 — sense sky, think blue, tool
 * purple, action red, memory green, guardrail yellow.
 *
 * Colour never carries the meaning alone: every row also shows this label and
 * the event's own name (03 §8).
 */

export type TraceLane =
	'run' | 'tick' | 'sense' | 'think' | 'tool' | 'action' | 'memory' | 'guardrail' | 'error';

const LANES: Record<EventType, TraceLane> = {
	'run.started': 'run',
	'run.finished': 'run',
	'tick.started': 'tick',
	'tick.completed': 'tick',
	sense: 'sense',
	'prompt.composed': 'think',
	'think.started': 'think',
	'think.token': 'think',
	'think.completed': 'think',
	decision: 'think',
	'tool.executed': 'tool',
	'action.performed': 'action',
	'world.changed': 'action',
	'memory.updated': 'memory',
	'guardrail.checked': 'guardrail',
	'guardrail.tripped': 'guardrail',
	'approval.requested': 'guardrail',
	'approval.resolved': 'guardrail',
	// Something said to the bot is something it perceives, so it belongs in the
	// same lane as looking around (E2).
	'input.delivered': 'sense',
	// A wait forced by the provider is a thinking cost, not an error (E11).
	'provider.retried': 'think',
	// A group's own start/finish sit at the same altitude as a solo run's,
	// just for the whole group rather than one agent (WP29, `23-…` §4.6).
	// No new lane/colour: hard rule 6 keeps the mapping fixed, and this pair
	// is not yet shown anywhere a lane colour would matter (that's stage F).
	'group.started': 'run',
	'group.finished': 'run',
	error: 'error'
};

/** Plain-language row labels — the trace is teaching material, not a log file. */
const LABELS: Record<EventType, string> = {
	'run.started': 'Run started',
	'run.finished': 'Run finished',
	'tick.started': 'Turn started',
	'tick.completed': 'Turn finished',
	sense: 'Looked around',
	'prompt.composed': 'Prompt composed',
	'think.started': 'Started thinking',
	'think.token': 'Thinking…',
	'think.completed': 'Finished thinking',
	decision: 'Decided',
	'tool.executed': 'Used a tool',
	'action.performed': 'Did something',
	'world.changed': 'The world changed',
	'memory.updated': 'Remembered',
	'guardrail.checked': 'Safety check',
	'guardrail.tripped': 'Safety rule stopped it',
	'approval.requested': 'Asked permission',
	'approval.resolved': 'Permission answered',
	'input.delivered': 'Somebody said something',
	'provider.retried': 'Waited, then asked again',
	'group.started': 'Group started',
	'group.finished': 'Group finished',
	error: 'Something went wrong'
};

export function laneOf(type: EventType): TraceLane {
	return LANES[type];
}

export function labelOf(type: EventType): string {
	return LABELS[type];
}

/**
 * The row label, given the event itself.
 *
 * Almost always just the type's label. The exception is 03-UI-UX-DESIGN.md §9's
 * **"The bot mumbled"**: a `decision` carrying neither a call nor a thought is
 * the malformed-output case, and calling that "Decided" hides the one teaching
 * moment the row exists for. Derived from the payload rather than from a new
 * event type — the data is already in the trace, so hard rule 3 holds.
 */
export function labelForEvent(event: EngineEvent): string {
	if (event.type === 'decision' && event.payload.call === null && event.payload.thought === '') {
		return 'The bot mumbled';
	}
	if (event.type === 'error') return errorLabel(event.payload.kind ?? '');
	if (
		(event.type === 'guardrail.checked' || event.type === 'guardrail.tripped') &&
		event.payload.policyCardId
	) {
		return `${labelOf(event.type)} (${policyCardLocalName(event.payload.policyCardId)})`;
	}
	return labelOf(event.type);
}

/**
 * A policy card's own local name, for the trace row — "no-loose-ends" rather
 * than the qualified `starter/policy/no-loose-ends`. The row has no registry
 * to look the card's title up in (`14-…` §4.6, WP22); the id itself is
 * already enough to find the card again, which is what a forensics row needs.
 */
function policyCardLocalName(id: string): string {
	const lastSlash = id.lastIndexOf('/');
	return lastSlash === -1 ? id : id.slice(lastSlash + 1);
}

/**
 * Kit-language copy for each provider failure — the "kit copy hook" column of
 * `06-LLM-PROVIDERS.md` §7, which `03` §9 asks for as "plain-language
 * explanation… raw error one click away". The raw payload is the click: it is
 * already in the row's detail pane, untouched. This is the layer on top, never
 * a replacement (03 §9).
 */
const ERROR_COPY: Record<string, string> = {
	'bad-key': "This battery isn't charged",
	'rate-limited': 'The brain needs a breather',
	quota: 'This battery is flat',
	filtered: 'The brain declined to answer',
	network: "Can't reach the brain factory",
	'provider-down': 'The brain factory is having a bad day',
	malformed: 'The brain sent something unreadable'
};

export function errorLabel(kind: string): string {
	return ERROR_COPY[kind] ?? 'Something went wrong';
}

/** The lane's name in words, for the row's accessible description. */
export function laneLabel(lane: TraceLane): string {
	return lane === 'run' ? 'run' : lane;
}
