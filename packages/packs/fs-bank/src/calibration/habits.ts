import type { CalibrationTable, ErrorModel } from '@craftabot/core';
import { row, table } from './rows.js';
import measured from './measured-habits.json' with { type: 'json' };

interface MeasuredHabit {
	id: string;
	design: string;
	suite: string;
	model: string;
	recordedOn: string;
	calls: number;
	cells: number;
	repeat: number;
	repeatInterval: [number, number];
	noCall: number;
	noCallInterval: [number, number];
	cellsWithRepeat: number;
	cellsWithNoCall: number;
}

/** The desks the habit models cover: the designs with a book or a conversation, not the scenario design or the live customer's seat. */
const DESKS = [
	'advice',
	'collections',
	'complaints',
	'disputes',
	'fraud',
	'lending',
	'onboarding',
	'servicing'
];
const deskOf = (row: MeasuredHabit): string | undefined =>
	DESKS.find((desk) => row.id.startsWith(`${desk}-`) && !row.id.includes('-seat-'));

const used = (measured as MeasuredHabit[]).filter((each) => deskOf(each) !== undefined);

/**
 * **How a live model fails other than by deciding wrongly** (plan 114 WP203, D7): per desk and per suite, the share of the brain's calls
 * that repeated the call just made, and the share that were prose where the desk needed a tool call — counted over the committed cassettes
 * by \`scripts/measured-habits.mjs\`. They sit beside \`ERROR_RATES\` and are played by the scripted tier through \`bankHabitModels\`, so a
 * control for a habit (the loop guard, a reply contract) is measured on the mock before it is paid for on the Sparks. One sample of one model
 * at temperature 0 on this synthetic bank; the intervals are per call and understate the uncertainty, since a model that starts repeating
 * keeps on. \`review: 'pending'\`.
 */
export const HABIT_RATES: CalibrationTable = table(
	'fs-bank/habit-rates',
	'How often a live model repeats a call or answers in prose',
	'The per-call share of a live brain’s turns that repeated the call just made or gave prose where a tool call was needed, per desk and model, from the committed recordings.',
	used.map((habit) =>
		row({
			id: habit.id,
			kind: 'rates',
			title: `The ${deskOf(habit)} desk: how ${habit.model} fails other than by deciding wrongly`,
			distribution: { repeat: habit.repeat, noCall: habit.noCall },
			source: {
				kind: 'measurement',
				recording: habit.design,
				model: habit.model,
				n: habit.calls,
				interval: habit.noCallInterval,
				retrieved: habit.recordedOn
			},
			tolerance: 0.5,
			note: `Measured over ${habit.calls} calls in ${habit.cells} cells: ${Math.round(habit.repeat * 1000) / 10}% repeated the call just made (95% per-call interval ${Math.round(habit.repeatInterval[0] * 1000) / 10}–${Math.round(habit.repeatInterval[1] * 1000) / 10}%; ${habit.cellsWithRepeat} cells showed it at least once), ${Math.round(habit.noCall * 1000) / 10}% were prose with no tool call (${Math.round(habit.noCallInterval[0] * 1000) / 10}–${Math.round(habit.noCallInterval[1] * 1000) / 10}%; ${habit.cellsWithNoCall} cells). The source's interval is the no-call one. Per-call intervals understate the uncertainty: the calls of a cell are not independent.`
		})
	)
);

/** One error model per desk and suite: no decision faults, the measured habits (`HabitFault`), named so a fallible brain can play them. */
export const bankHabitModels: ErrorModel[] = used.map((habit) => ({
	id: `fs-bank/error/habits-${habit.id.replace('-habits-', '-')}`,
	name: `${habit.model} on the ${deskOf(habit)} desk: its habits`,
	description: `Repeats the call it just made on ${Math.round(habit.repeat * 1000) / 10}% of turns and answers in prose on ${Math.round(habit.noCall * 1000) / 10}%, as the recording of ${habit.recordedOn} measured; plants no wrong decision.`,
	faults: [],
	habits: [
		{ kind: 'repeat', rate: { table: 'fs-bank/habit-rates', row: habit.id, key: 'repeat' } },
		{ kind: 'no-call', rate: { table: 'fs-bank/habit-rates', row: habit.id, key: 'noCall' } }
	]
}));
