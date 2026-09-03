import type { EngineEvent } from '@craftabot/core';

/**
 * **The run as the evaluation service reads it** (`39-HOSTED-EVALUATOR.md`
 * §3 principle 2): the bot's own words and deeds, per tick — the same shape
 * the rubric judge renders, kept here so this pack does not depend on
 * `pack-evaluators`. Never the spec, never a key; the prompt's system
 * message is read only for the goal, which is what fulfillment compares
 * against.
 */

export interface TranscriptLine {
	tick: number;
	eventId: string;
	line: string;
}

export function renderTranscript(
	events: readonly EngineEvent[],
	maxTicks: number
): TranscriptLine[] {
	const lines: TranscriptLine[] = [];
	for (const event of events) {
		switch (event.type) {
			case 'sense':
				lines.push({
					tick: event.tick,
					eventId: event.id,
					line: `saw: ${event.payload.observation.summary ?? event.payload.observation.text}`
				});
				break;
			case 'decision':
				lines.push({
					tick: event.tick,
					eventId: event.id,
					line: `thought: ${event.payload.thought}${event.payload.call ? ` → ${event.payload.call.name}(${JSON.stringify(event.payload.call.arguments)})` : ''}`
				});
				break;
			case 'action.performed':
				lines.push({
					tick: event.tick,
					eventId: event.id,
					line: `did: ${event.payload.result.narration}`
				});
				break;
			case 'tool.executed':
				lines.push({
					tick: event.tick,
					eventId: event.id,
					line: `tool ${event.payload.name} → ${JSON.stringify(event.payload.result)}`
				});
				break;
			case 'guardrail.tripped':
				lines.push({
					tick: event.tick,
					eventId: event.id,
					line: `guardrail: ${event.payload.reason}`
				});
				break;
			case 'run.finished':
				lines.push({
					tick: event.tick,
					eventId: event.id,
					line: `finished: ${event.payload.outcome}`
				});
				break;
			default:
				break;
		}
	}
	const ticks = [...new Set(lines.map((line) => line.tick))];
	const kept = new Set(ticks.slice(-maxTicks));
	return lines.filter((line) => kept.has(line.tick));
}

/** One string for the service's `prediction`. */
export function transcriptText(lines: readonly TranscriptLine[]): string {
	return lines.map((line) => `[tick ${line.tick}] ${line.line}`).join('\n');
}

/**
 * The goal as the bot was told it: the first composed prompt's system
 * message. `undefined` when the run never composed one (a reflex-only run).
 */
export function goalText(events: readonly EngineEvent[]): string | undefined {
	for (const event of events) {
		if (event.type !== 'prompt.composed') continue;
		const system = event.payload.messages.find((message) => message.role === 'system');
		if (system && typeof system.content === 'string') return system.content;
	}
	return undefined;
}
