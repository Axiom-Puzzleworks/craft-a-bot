import type { DeskQueueItem, DeskRecord } from '@craftabot/core';

/**
 * Every string the runtime itself produces — the generic voice of a desk,
 * UK English, second person. A desk's own voice lives in its handlers'
 * narration; these are only the lines every desk shares (the built-in
 * `say`, the built-in senses, the failure paths the runtime owns).
 */
const fieldsOf = (record: DeskRecord): string =>
	Object.entries(record.fields)
		.map(([key, value]) => `${key.replaceAll('_', ' ')} ${value === null ? '—' : String(value)}`)
		.join(', ');

export const runtimeStrings = {
	agentName: 'You',
	counterpartName: 'Customer',
	systemName: 'Desk',
	say: {
		name: 'Say',
		description: 'Say something to the person at the desk.',
		text: 'What to say.'
	},
	/** The counterpart seat's second action (WP55, `46-…` §4.4). */
	hangUp: {
		name: 'Hang up',
		description: 'End the conversation and leave the desk.',
		reason: 'Why, if you want to say.'
	},
	/** The counterpart seat's own sense: who you are and what you know. */
	brief: {
		name: 'Brief',
		description: 'Who you are, and what you know that the desk does not.'
	},
	observation: {
		brief: (persona: string, knows: string | undefined) =>
			knows === undefined ? persona : `${persona}\n${knows}`,
		nothingSaid: 'Nobody has said anything since you last listened.',
		heard: (lines: string[]) =>
			`Since you last listened:\n${lines.map((l) => `  ${l}`).join('\n')}`,
		caseFile: (records: readonly DeskRecord[]) =>
			records.length === 0
				? 'Nothing is open on the desk.'
				: `Open on the desk:\n${records.map((r) => `  ${r.title}: ${fieldsOf(r)}`).join('\n')}`,
		queue: (items: readonly DeskQueueItem[]) =>
			items.length === 0
				? 'The queue is empty.'
				: `Queue: ${items.map((i) => `${i.title} (${i.status}${i.decision ? ` — ${i.decision}` : ''})`).join('; ')}`,
		noSenses: 'You have no sense of the desk switched on.',
		summary: (open: number, done: number, last: string | undefined) =>
			`${open} open, ${done} done${last ? ` — last said: ${last}` : ''}`
	},
	/** What the scripted-counterpart brain thinks when it has nothing to say. */
	counterpartBrain: { waiting: 'Waiting for the clerk.', leaving: 'Leaving.' },
	narration: {
		hungUp: (name: string, reason: string | undefined) =>
			reason ? `${name} ends the conversation: ${reason}` : `${name} ends the conversation.`,
		onlyTheVisitorHangsUp: 'Only the person across the desk can hang up.',
		counterpartCannot: (action: string) =>
			`The person across the desk cannot "${action}" — they can only speak, or hang up.`,
		secondAgentSeat: 'A desk has one clerk; a second agent seat cannot be bound.',
		counterpartEscalates: (name: string) => `${name} is asking for someone senior.`,
		counterpartLeft: (name: string) => `${name} has ended the conversation.`,
		said: (text: string) => `You say: "${text}"`,
		badArguments: (action: string, problem: string) => `${action} could not run: ${problem}.`,
		unknownAction: (name: string) => `"${name}" is not something you can do at this desk.`,
		revealed: (record: DeskRecord) => `You open ${record.title}: ${fieldsOf(record)}.`,
		manualEntry: (key: string) => `A note lands on the desk: ${key}.`
	}
} as const;
