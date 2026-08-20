import type { Observation, WorldSenseDefinition } from '@craftabot/core';
import { observationStrings, senseStrings } from '../strings.js';
import { type Cell, inBounds, relativeDirection } from './grid.js';
import {
	blockerAt,
	itemsInContainer,
	itemsOnFloorAt,
	type PlayroomState,
	type RadioMessage
} from './state.js';
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
export const SENSE_RADIO = 'radio';

/** Canonical order, so an observation reads the same way every tick. */
const CHANNEL_ORDER = [
	SENSE_SIGHT,
	SENSE_HEARING,
	SENSE_COMPASS,
	SENSE_CLOCK,
	SENSE_RADIO
] as const;

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
	{ id: SENSE_CLOCK, name: senseStrings.clock.name, description: senseStrings.clock.description },
	{ id: SENSE_RADIO, name: senseStrings.radio.name, description: senseStrings.radio.description }
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

/** Where the bot stood, phrased as the compass phrases it. */
function positionPhrase(state: PlayroomState): string {
	return observationStrings.summaryPosition(state.bot.position.x, state.bot.position.y);
}

/**
 * The one-line memory form: what was worth noticing, where it was, and what
 * the bot was holding. Everything the full observation says about empty rug is
 * dropped.
 *
 * The bearings are the point (E4, `14-…` §3). A remembered name is only useful
 * if the bot can act on it, and "a stripy ball" with no direction is a fact it
 * can do nothing with; "a stripy ball to the north-east, from column 4, row 5"
 * is a plan.
 */
function sightSummary(state: PlayroomState): string {
	const near: string[] = [];
	for (const offset of SIGHT_OFFSETS) {
		const cell = { x: state.bot.position.x + offset.x, y: state.bot.position.y + offset.y };
		if (!inBounds(cell, state.width, state.height)) continue;
		const direction = relativeDirection(state.bot.position, cell);
		const blocker = blockerAt(state, cell);
		if (blocker) {
			const container = state.containers.find((candidate) => candidate.id === blocker.id);
			near.push(
				observationStrings.summarySeen(
					container ? describeContainer(state, container) : blocker.name,
					direction
				)
			);
		}
		for (const item of itemsOnFloorAt(state, cell)) {
			near.push(observationStrings.summarySeen(item.name, direction));
		}
	}
	const carried = carriedItem(state);
	const hands = carried
		? observationStrings.summaryCarrying(carried.name)
		: observationStrings.summaryEmptyHands;
	return observationStrings.sightSummary(positionPhrase(state), near, hands);
}

/** The compass's landmarks, as the memory line wants them; empty room ⇒ nothing. */
function compassSummary(state: PlayroomState): string | undefined {
	const landmarks = [...state.containers, ...state.furniture].map((landmark) =>
		observationStrings.compassLandmark(
			landmark.name,
			relativeDirection(state.bot.position, landmark.position)
		)
	);
	return landmarks.length > 0 ? observationStrings.compassSummary(landmarks.join(', ')) : undefined;
}

/**
 * The short form the Memory brick keeps. Sight carries it when fitted; the
 * compass adds its bearings (E4 asks for the compass line in the memory
 * record), and stands in on its own for a bot with a compass and no eyes —
 * which knows exactly where it is and deserves to remember it.
 */
function summariseObservation(
	state: PlayroomState,
	enabled: readonly string[]
): string | undefined {
	const parts: string[] = [];
	if (enabled.includes(SENSE_SIGHT)) parts.push(sightSummary(state));
	if (enabled.includes(SENSE_COMPASS)) {
		if (parts.length === 0) {
			parts.push(observationStrings.positionOnlySummary(positionPhrase(state)));
		}
		const landmarks = compassSummary(state);
		if (landmarks !== undefined) parts.push(landmarks);
	}
	return parts.length > 0 ? parts.join('; ') : undefined;
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

/**
 * Radio, per-recipient — unlike Hearing's one shared queue (WP29's own known
 * gap, `23-…` §9), each agent gets its own cursor into the shared log, keyed
 * by `state.bot.id` the same way `carriedItem` and every other seat-aware
 * lookup already is. Advances past every message just seen, matching or not
 * — a message on a channel this agent does not listen to is still *seen*,
 * or it would be re-evaluated (and re-missed) forever.
 */
function radioMessagesFor(state: PlayroomState): RadioMessage[] {
	const agentId = state.bot.id ?? 'solo';
	const config = state.radioConfigs?.[agentId];
	const all = state.radio ?? [];
	const cursor = state.radioCursors?.[agentId] ?? 0;
	const unseen = all.slice(cursor);

	state.radioCursors ??= {};
	state.radioCursors[agentId] = all.length;

	if (!config) return [];
	return unseen.filter(
		(message) =>
			message.channel === config.channel &&
			(config.allowFrom === undefined || config.allowFrom.includes(message.from))
	);
}

export function observePlayroom(state: PlayroomState, channels: string[]): Observation {
	const enabled = CHANNEL_ORDER.filter((channel) => channels.includes(channel));
	const lines: string[] = [];
	const data: Record<string, unknown> = {};
	// Taken before the loop, because Hearing drains what it reports.
	const summary = summariseObservation(state, enabled);

	for (const channel of enabled) {
		switch (channel) {
			case SENSE_SIGHT: {
				lines.push(...sightLines(state));
				data[SENSE_SIGHT] = { position: { ...state.bot.position } };
				break;
			}
			case SENSE_HEARING: {
				// Draining is deliberate: a message is heard once, then it is old news.
				//
				// One shared queue, drained by whichever agent's turn observes it
				// first (WP29): on a co-op layout, a message delivered between two
				// agents' turns is heard by only one of them, never both. No card
				// shipped through WP29 fits Hearing to more than one seat, so this
				// is unexercised rather than untrue — a duo card that does would
				// need a per-agent queue, which is real, undone work, not a trap
				// this comment quietly papers over.
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
			case SENSE_RADIO: {
				const messages = radioMessagesFor(state);
				lines.push(
					messages.length > 0
						? observationStrings.radioHeard(messages)
						: observationStrings.radioNothing
				);
				data[SENSE_RADIO] = { messages };
				break;
			}
		}
	}

	return {
		channels: [...enabled],
		text: lines.length > 0 ? lines.join('\n') : observationStrings.nothingSensed,
		// Sight and the compass produce a short form; a bot with neither has
		// nothing worth condensing, and omitting it leaves the full text
		// remembered as before.
		...(summary !== undefined ? { summary } : {}),
		data
	};
}
