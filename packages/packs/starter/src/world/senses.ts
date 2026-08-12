import type { Observation, WorldSenseDefinition } from '@craftabot/core';
import { observationStrings, senseStrings } from '../strings.js';
import { type Cell, inBounds, relativeDirection } from './grid.js';
import { blockerAt, itemsInContainer, itemsOnFloorAt, type PlayroomState } from './state.js';
import { carriedItem } from './actions.js';

/**
 * The four sense channels (02-AGENT-MODEL.md §2.4). What Sense reports is
 * computed by the world from the bot's position — the flip side of the brick
 * explains that "senses" are context engineering: what you choose to put in
 * the prompt. Output is plain readable text, not JSON, because users read it
 * in the trace (02-AGENT-MODEL.md §8); `data` carries the same facts for the UI.
 */

export const SENSE_SIGHT = 'sight';
export const SENSE_HEARING = 'hearing';
export const SENSE_COMPASS = 'compass';
export const SENSE_CLOCK = 'clock';

/** Canonical order, so an observation reads the same way every tick. */
const CHANNEL_ORDER = [SENSE_SIGHT, SENSE_HEARING, SENSE_COMPASS, SENSE_CLOCK] as const;

export const playroomSenses: WorldSenseDefinition[] = [
	{ id: SENSE_SIGHT, name: senseStrings.sight.name, description: senseStrings.sight.description },
	{
		id: SENSE_HEARING,
		name: senseStrings.hearing.name,
		description: senseStrings.hearing.description
	},
	{
		id: SENSE_COMPASS,
		name: senseStrings.compass.name,
		description: senseStrings.compass.description
	},
	{ id: SENSE_CLOCK, name: senseStrings.clock.name, description: senseStrings.clock.description }
];

/** Offsets in reading order: where you stand, then clockwise from north. */
const SIGHT_OFFSETS: Cell[] = [
	{ x: 0, y: 0 },
	{ x: 0, y: -1 },
	{ x: 1, y: -1 },
	{ x: 1, y: 0 },
	{ x: 1, y: 1 },
	{ x: 0, y: 1 },
	{ x: -1, y: 1 },
	{ x: -1, y: 0 },
	{ x: -1, y: -1 }
];

function describeCell(state: PlayroomState, cell: Cell): string {
	const parts: string[] = [];
	const blocker = blockerAt(state, cell);
	if (blocker) {
		const container = state.containers.find((candidate) => candidate.id === blocker.id);
		if (container) {
			parts.push(describeContainer(state, container));
		} else {
			parts.push(blocker.name);
		}
	}
	for (const item of itemsOnFloorAt(state, cell)) {
		parts.push(item.name);
	}
	return parts.length > 0 ? parts.join(', ') : observationStrings.sightNothing;
}

/**
 * An open container is described with its contents, a closed one is not — you
 * cannot see through a lid, and pretending otherwise would let a bot plan
 * around things it has no way of knowing.
 */
function describeContainer(
	state: PlayroomState,
	container: { id: string; name: string; state: string }
): string {
	if (container.state !== 'open') {
		return observationStrings.containerState(container.name, container.state);
	}
	const inside = itemsInContainer(state, container.id).map((item) => item.name);
	return inside.length > 0
		? observationStrings.containerWithContents(container.name, container.state, inside)
		: observationStrings.containerEmpty(container.name, container.state);
}

/**
 * The one-line memory form: what was worth noticing, and what the bot was
 * holding. Everything the full observation says about empty rug is dropped.
 */
function sightSummary(state: PlayroomState): string {
	const near: string[] = [];
	for (const offset of SIGHT_OFFSETS) {
		const cell = { x: state.bot.position.x + offset.x, y: state.bot.position.y + offset.y };
		if (!inBounds(cell, state.width, state.height)) continue;
		const blocker = blockerAt(state, cell);
		if (blocker) {
			const container = state.containers.find((candidate) => candidate.id === blocker.id);
			near.push(container ? describeContainer(state, container) : blocker.name);
		}
		for (const item of itemsOnFloorAt(state, cell)) near.push(item.name);
	}
	const carried = carriedItem(state);
	const hands = carried
		? observationStrings.sightCarrying(carried.name)
		: observationStrings.sightEmptyHands;
	return observationStrings.sightSummary(near, hands);
}

function sightLines(state: PlayroomState): string[] {
	const lines: string[] = [observationStrings.sightHeading];
	for (const offset of SIGHT_OFFSETS) {
		const cell = { x: state.bot.position.x + offset.x, y: state.bot.position.y + offset.y };
		const contents = inBounds(cell, state.width, state.height)
			? describeCell(state, cell)
			: observationStrings.sightWall;
		if (offset.x === 0 && offset.y === 0) {
			lines.push(observationStrings.sightHere(contents));
		} else {
			lines.push(
				observationStrings.sightDirection(relativeDirection(state.bot.position, cell), contents)
			);
		}
	}
	const carried = carriedItem(state);
	lines.push(
		carried ? observationStrings.sightCarrying(carried.name) : observationStrings.sightEmptyHands
	);
	return lines;
}

/**
 * Landmarks are the big furniture only — never items, and never Teddy
 * (02-AGENT-MODEL.md §4: "landmark directions, not item locations — so the bot
 * must explore"). Leaking Teddy's bearing would make "Say Hello!" trivial.
 */
function compassLines(state: PlayroomState): string[] {
	const lines: string[] = [
		observationStrings.compassPosition(
			state.bot.position.x,
			state.bot.position.y,
			state.width,
			state.height
		)
	];
	const landmarks = [...state.containers, ...state.furniture].map((landmark) =>
		observationStrings.compassLandmark(
			landmark.name,
			relativeDirection(state.bot.position, landmark.position)
		)
	);
	lines.push(
		landmarks.length > 0
			? observationStrings.compassLandmarks(landmarks.join(', '))
			: observationStrings.compassNoLandmarks
	);
	return lines;
}

export function observePlayroom(state: PlayroomState, channels: string[]): Observation {
	const enabled = CHANNEL_ORDER.filter((channel) => channels.includes(channel));
	const lines: string[] = [];
	const data: Record<string, unknown> = {};
	let summary: string | undefined;

	for (const channel of enabled) {
		switch (channel) {
			case SENSE_SIGHT: {
				lines.push(...sightLines(state));
				data[SENSE_SIGHT] = { position: { ...state.bot.position } };
				summary = sightSummary(state);
				break;
			}
			case SENSE_HEARING: {
				// Draining is deliberate: a message is heard once, then it is old news.
				const heard = state.heard.splice(0, state.heard.length);
				lines.push(
					heard.length > 0 ? observationStrings.heard(heard) : observationStrings.heardNothing
				);
				data[SENSE_HEARING] = { lines: heard };
				break;
			}
			case SENSE_COMPASS: {
				lines.push(...compassLines(state));
				data[SENSE_COMPASS] = {
					position: { ...state.bot.position },
					width: state.width,
					height: state.height
				};
				break;
			}
			case SENSE_CLOCK: {
				lines.push(observationStrings.clock(state.tick, state.tick));
				data[SENSE_CLOCK] = { tick: state.tick, elapsedSeconds: state.tick };
				break;
			}
		}
	}

	return {
		channels: [...enabled],
		text: lines.length > 0 ? lines.join('\n') : observationStrings.nothingSensed,
		// Only sight produces a short form; a bot with no eyes has nothing worth
		// condensing, and omitting it leaves the full text remembered as before.
		...(summary !== undefined ? { summary } : {}),
		data
	};
}
