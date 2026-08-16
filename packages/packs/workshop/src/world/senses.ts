import type { Observation, WorldSenseDefinition } from '@craftabot/core';
import { observationStrings, senseStrings } from '../strings.js';
import { withinReach, type Cell } from './grid.js';
import type { WorkshopState } from './state.js';

/**
 * The Workshop's two senses (WP28). `sight` is the Playroom's rule, cut down
 * to this room's contents. `smell` is the new one — the sense channel this
 * world exists to add (`14-…` §4.4: "new worlds ship new channels"), and it
 * is not decoration: it is the room's only way to notice a `paint` action's
 * one lasting side effect without walking right up to the thing.
 */

export const SENSE_SIGHT = 'sight';
export const SENSE_SMELL = 'smell';

const CHANNEL_ORDER = [SENSE_SIGHT, SENSE_SMELL] as const;

export const workshopSenses: WorldSenseDefinition[] = [
	{ id: SENSE_SIGHT, name: senseStrings.sight.name, description: senseStrings.sight.description },
	{ id: SENSE_SMELL, name: senseStrings.smell.name, description: senseStrings.smell.description }
];

function describeCell(state: WorkshopState, cell: Cell): string {
	const parts: string[] = [];
	const furniture = state.furniture.find(
		(piece) => piece.position.x === cell.x && piece.position.y === cell.y
	);
	if (furniture) parts.push(furniture.name);
	for (const item of state.items) {
		if (
			item.location.kind === 'floor' &&
			item.location.position.x === cell.x &&
			item.location.position.y === cell.y
		) {
			parts.push(item.painted ? `${item.name} (painted ${item.painted.color})` : item.name);
		}
	}
	return parts.length > 0 ? parts.join(', ') : observationStrings.sightNothing;
}

function sightLines(state: WorkshopState): string[] {
	const { x, y } = state.bot.position;
	const offsets: { dx: number; dy: number; label: string }[] = [
		{ dx: 0, dy: 0, label: 'here' },
		{ dx: 0, dy: -1, label: 'north' },
		{ dx: 0, dy: 1, label: 'south' },
		{ dx: 1, dy: 0, label: 'east' },
		{ dx: -1, dy: 0, label: 'west' }
	];
	const lines: string[] = [observationStrings.sightHeading];
	for (const offset of offsets) {
		const cell = { x: x + offset.dx, y: y + offset.dy };
		const inBounds = cell.x >= 0 && cell.x < state.width && cell.y >= 0 && cell.y < state.height;
		const contents = inBounds ? describeCell(state, cell) : observationStrings.sightWall;
		lines.push(
			offset.label === 'here'
				? observationStrings.sightHere(contents)
				: observationStrings.sightDirection(offset.label, contents)
		);
	}
	return lines;
}

/** Whether any painted (still-wet, in this room's telling) item is within reach. */
function smellsWetPaint(state: WorkshopState): boolean {
	return state.items.some(
		(item) =>
			item.painted !== undefined &&
			item.location.kind === 'floor' &&
			withinReach(state.bot.position, item.location.position)
	);
}

export function observeWorkshop(state: WorkshopState, channels: string[]): Observation {
	const enabled = CHANNEL_ORDER.filter((channel) => channels.includes(channel));
	const lines: string[] = [];
	const data: Record<string, unknown> = {};

	for (const channel of enabled) {
		if (channel === SENSE_SIGHT) {
			lines.push(...sightLines(state));
			data[SENSE_SIGHT] = { position: { ...state.bot.position } };
		} else if (channel === SENSE_SMELL) {
			const wet = smellsWetPaint(state);
			lines.push(wet ? observationStrings.smellPaint : observationStrings.smellNothing);
			data[SENSE_SMELL] = { wetPaintNearby: wet };
		}
	}

	return {
		channels: [...enabled],
		text: lines.length > 0 ? lines.join('\n') : observationStrings.nothingSensed,
		...(enabled.includes(SENSE_SIGHT)
			? { summary: observationStrings.sightHere(describeCell(state, state.bot.position)) }
			: {}),
		data
	};
}
