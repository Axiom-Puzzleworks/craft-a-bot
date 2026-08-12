import type { EventType } from '@craftabot/core';

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
	error: 'Something went wrong'
};

export function laneOf(type: EventType): TraceLane {
	return LANES[type];
}

export function labelOf(type: EventType): string {
	return LABELS[type];
}

/** The lane's name in words, for the row's accessible description. */
export function laneLabel(lane: TraceLane): string {
	return lane === 'run' ? 'run' : lane;
}
