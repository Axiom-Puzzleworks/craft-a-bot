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
	observation: {
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
	narration: {
		said: (text: string) => `You say: "${text}"`,
		badArguments: (action: string, problem: string) => `${action} could not run: ${problem}.`,
		unknownAction: (name: string) => `"${name}" is not something you can do at this desk.`,
		revealed: (record: DeskRecord) => `You open ${record.title}: ${fieldsOf(record)}.`,
		manualEntry: (key: string) => `A note lands on the desk: ${key}.`
	}
} as const;
