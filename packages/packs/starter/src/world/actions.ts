import type { WorldActionDefinition } from '@craftabot/core';
import { z } from 'zod';
import { actionStrings, narration, sentenceCase } from '../strings.js';
import { ORTHOGONAL_DIRECTIONS, inBounds, step, withinReach } from './grid.js';
import {
	blockerAt,
	findCharacter,
	findContainer,
	reachableItemNames,
	resolveCharacter,
	resolveContainer,
	resolveItem,
	type PlayroomCharacter,
	type PlayroomContainer,
	type PlayroomItem,
	type PlayroomState,
	type StateChange
} from './state.js';

/**
 * The Playroom's seven actions (02-AGENT-MODEL.md §2.5). Each pairs a Zod
 * schema — LLM tool arguments are a runtime boundary (10-CODING-STANDARDS.md §1)
 * — with the JSON schema derived from it, so the wire contract and the
 * validation can never drift apart.
 *
 * Two invariants the tests lean on:
 *  - an illegal action NEVER throws and NEVER mutates; it returns
 *    `{ ok: false }` with a warm explanation, because failure is a teaching
 *    moment, not an error (00-PROJECT-OVERVIEW.md §3.2);
 *  - the world is turn-based, so its clock advances when the bot acts.
 */

export type ActionOutcome = {
	ok: boolean;
	narration: string;
	stateDiff: StateChange[];
	/** Names the bot might have meant, when one matched several (`16-…` §2.4). */
	didYouMean?: string[];
};

function fail(message: string): ActionOutcome {
	return { ok: false, narration: message, stateDiff: [] };
}

/**
 * A miss the player can be offered choices for (`16-…` §2.4).
 *
 * The narration is unchanged and remains what the *bot* reads and acts on; the
 * names ride alongside as data so the UI can put them on tappable chips. The
 * bot still learns from the text, which is the point — the chips are for the
 * child's understanding, not the bot's.
 */
function failWithChoices(message: string, choices: readonly string[]): ActionOutcome {
	return { ok: false, narration: message, stateDiff: [], didYouMean: [...choices] };
}

/**
 * Turning "what the model called it" into "which thing it meant".
 *
 * Every one of these lookups takes a string an LLM wrote, so none of them may
 * assume it is an id — see `resolveNamed` in `state.ts` for the bug that taught
 * us. A miss is always narrated with something the bot can use next turn.
 */
type Lookup<T> = { entity: T } | { failure: ActionOutcome };

function isMiss<T>(lookup: Lookup<T>): lookup is { failure: ActionOutcome } {
	return 'failure' in lookup;
}

function lookUpItem(state: PlayroomState, query: string): Lookup<PlayroomItem> {
	const found = resolveItem(state, query);
	if (found.kind === 'found') return { entity: found.entity };
	if (found.kind === 'ambiguous') {
		const names = found.matches.map((match) => match.name);
		return {
			failure: failWithChoices(narration.ambiguousItem(query, names), names)
		};
	}
	return { failure: fail(narration.noSuchItem(query, reachableItemNames(state))) };
}

function lookUpCharacter(state: PlayroomState, query: string): Lookup<PlayroomCharacter> {
	const found = resolveCharacter(state, query);
	if (found.kind === 'found') return { entity: found.entity };
	if (found.kind === 'ambiguous') {
		const names = found.matches.map((match) => match.name);
		return {
			failure: failWithChoices(narration.ambiguousCharacter(query, names), names)
		};
	}
	return {
		failure: fail(
			narration.noSuchCharacter(
				query,
				state.characters.map((character) => character.name)
			)
		)
	};
}

function lookUpContainer(state: PlayroomState, query: string): Lookup<PlayroomContainer> {
	const found = resolveContainer(state, query);
	if (found.kind === 'found') return { entity: found.entity };
	if (found.kind === 'ambiguous') {
		const names = found.matches.map((match) => match.name);
		return {
			failure: failWithChoices(narration.ambiguousContainer(query, names), names)
		};
	}
	return {
		failure: fail(
			narration.noSuchContainer(
				query,
				state.containers.map((container) => container.name)
			)
		)
	};
}

function succeed(message: string, stateDiff: StateChange[]): ActionOutcome {
	return { ok: true, narration: message, stateDiff };
}

/** The single item in the bot's hands, if any. Carrying is stored only on the item. */
export function carriedItem(state: PlayroomState) {
	return state.items.find((item) => item.location.kind === 'carried');
}

type ActionSpec<Schema extends z.ZodType> = {
	id: string;
	name: string;
	description: string;
	schema: Schema;
	run: (state: PlayroomState, args: z.infer<Schema>) => ActionOutcome;
};

export type PlayroomAction = {
	definition: WorldActionDefinition;
	perform: (state: PlayroomState, args: unknown) => ActionOutcome;
};

function defineAction<Schema extends z.ZodType>(spec: ActionSpec<Schema>): PlayroomAction {
	return {
		definition: {
			id: spec.id,
			name: spec.name,
			description: spec.description,
			parameters: z.toJSONSchema(spec.schema)
		},
		perform: (state, args) => {
			const parsed = spec.schema.safeParse(args ?? {});
			if (!parsed.success) {
				const problem = parsed.error.issues
					.map((issue) => `${issue.path.join('.') || 'arguments'} — ${issue.message}`)
					.join('; ');
				return fail(narration.badArguments(spec.id, problem));
			}
			return spec.run(state, parsed.data);
		}
	};
}

const move = defineAction({
	id: 'move',
	name: actionStrings.move.name,
	description: actionStrings.move.description,
	schema: z.object({
		direction: z.enum(ORTHOGONAL_DIRECTIONS).describe(actionStrings.move.direction)
	}),
	run: (state, args) => {
		const target = step(state.bot.position, args.direction);
		if (!inBounds(target, state.width, state.height)) {
			return fail(narration.blockedByWall(args.direction));
		}
		const blocker = blockerAt(state, target);
		if (blocker) {
			return fail(narration.blockedBy(args.direction, blocker.name));
		}
		const from = { ...state.bot.position };
		state.bot.position = target;
		return succeed(narration.moved(args.direction), [
			{ path: 'bot.position', from, to: { ...target } }
		]);
	}
});

const pickUp = defineAction({
	id: 'pick_up',
	name: actionStrings.pick_up.name,
	description: actionStrings.pick_up.description,
	schema: z.object({ item: z.string().describe(actionStrings.pick_up.item) }),
	run: (state, args) => {
		const found = lookUpItem(state, args.item);
		if (isMiss(found)) return found.failure;
		const item = found.entity;

		const location = item.location;
		if (location.kind === 'carried') {
			return fail(narration.handsFull(item.name));
		}
		const alreadyCarrying = carriedItem(state);
		if (alreadyCarrying) {
			return fail(narration.handsFull(alreadyCarrying.name));
		}

		if (location.kind === 'held-by') {
			const holder = findCharacter(state, location.characterId);
			return fail(narration.itemAlreadyHeld(item.name, holder?.name ?? location.characterId));
		}

		const from = { ...location };
		if (location.kind === 'in-container') {
			const container = findContainer(state, location.containerId);
			if (!container || !withinReach(state.bot.position, container.position)) {
				return fail(narration.outOfReach(item.name));
			}
			if (container.state !== 'open') {
				return fail(narration.itemInClosedContainer(item.name, container.name));
			}
			item.location = { kind: 'carried' };
			return succeed(narration.pickedUpFromContainer(item.name, container.name), [
				{ path: `items.${item.id}.location`, from, to: { kind: 'carried' } }
			]);
		}

		if (!withinReach(state.bot.position, location.position)) {
			return fail(narration.outOfReach(item.name));
		}
		item.location = { kind: 'carried' };
		return succeed(narration.pickedUp(item.name), [
			{ path: `items.${item.id}.location`, from, to: { kind: 'carried' } }
		]);
	}
});

const putDown = defineAction({
	id: 'put_down',
	name: actionStrings.put_down.name,
	description: actionStrings.put_down.description,
	schema: z.object({
		item: z.string().describe(actionStrings.put_down.item),
		container: z.string().optional().describe(actionStrings.put_down.container)
	}),
	run: (state, args) => {
		const found = lookUpItem(state, args.item);
		if (isMiss(found)) return found.failure;
		const item = found.entity;
		if (item.location.kind !== 'carried') return fail(narration.notCarrying(item.name));

		const from = { ...item.location };
		if (args.container !== undefined) {
			const target = lookUpContainer(state, args.container);
			if (isMiss(target)) return target.failure;
			const container = target.entity;
			if (!withinReach(state.bot.position, container.position)) {
				return fail(narration.outOfReach(container.name));
			}
			if (container.state !== 'open') return fail(narration.containerNotOpen(container.name));

			const to = { kind: 'in-container' as const, containerId: container.id };
			item.location = to;
			return succeed(narration.putInContainer(item.name, container.name), [
				{ path: `items.${item.id}.location`, from, to }
			]);
		}

		const to = { kind: 'floor' as const, position: { ...state.bot.position } };
		item.location = to;
		return succeed(narration.putDown(item.name), [{ path: `items.${item.id}.location`, from, to }]);
	}
});

const give = defineAction({
	id: 'give',
	name: actionStrings.give.name,
	description: actionStrings.give.description,
	schema: z.object({
		item: z.string().describe(actionStrings.give.item),
		character: z.string().describe(actionStrings.give.character)
	}),
	run: (state, args) => {
		const found = lookUpItem(state, args.item);
		if (isMiss(found)) return found.failure;
		const item = found.entity;
		if (item.location.kind !== 'carried') return fail(narration.notCarrying(item.name));

		const recipient = lookUpCharacter(state, args.character);
		if (isMiss(recipient)) return recipient.failure;
		const character = recipient.entity;
		if (!withinReach(state.bot.position, character.position)) {
			return fail(narration.characterOutOfReach(character.name));
		}

		const from = { ...item.location };
		const to = { kind: 'held-by' as const, characterId: character.id };
		item.location = to;
		return succeed(narration.gave(item.name, character.name), [
			{ path: `items.${item.id}.location`, from, to }
		]);
	}
});

const open = defineAction({
	id: 'open',
	name: actionStrings.open.name,
	description: actionStrings.open.description,
	schema: z.object({ container: z.string().describe(actionStrings.open.container) }),
	run: (state, args) => {
		const target = lookUpContainer(state, args.container);
		if (isMiss(target)) return target.failure;
		const container = target.entity;
		if (!withinReach(state.bot.position, container.position)) {
			return fail(narration.outOfReach(container.name));
		}
		if (container.state === 'open') return fail(narration.alreadyOpen(container.name));

		const from = container.state;
		if (container.state === 'locked') {
			const key = carriedItem(state);
			if (!key || key.id !== container.unlockedBy) {
				return fail(narration.lockedNeedsKey(container.name));
			}
			container.state = 'open';
			return succeed(narration.unlockedAndOpened(container.name, key.name), [
				{ path: `containers.${container.id}.state`, from, to: 'open' }
			]);
		}

		container.state = 'open';
		return succeed(narration.opened(container.name), [
			{ path: `containers.${container.id}.state`, from, to: 'open' }
		]);
	}
});

const say = defineAction({
	id: 'say',
	name: actionStrings.say.name,
	description: actionStrings.say.description,
	schema: z.object({ text: z.string().describe(actionStrings.say.text) }),
	run: (state, args) => {
		const spokenBefore = state.spoken.length;
		state.spoken.push({ tick: state.tick, text: args.text, position: { ...state.bot.position } });
		return succeed(narration.said(args.text), [
			{ path: 'spoken', from: spokenBefore, to: state.spoken.length }
		]);
	}
});

const celebrate = defineAction({
	id: 'celebrate',
	name: actionStrings.celebrate.name,
	description: actionStrings.celebrate.description,
	schema: z.object({}),
	run: (state) => {
		if (state.celebrated) return fail(narration.alreadyCelebrated);
		const from = state.celebrated;
		state.celebrated = true;
		return succeed(narration.celebrated, [{ path: 'celebrated', from, to: true }]);
	}
});

export const playroomActions: PlayroomAction[] = [
	move,
	pickUp,
	putDown,
	give,
	open,
	say,
	celebrate
];

export const playroomActionDefinitions: WorldActionDefinition[] = playroomActions.map(
	(action) => action.definition
);

export function findAction(id: string): PlayroomAction | undefined {
	return playroomActions.find((action) => action.definition.id === id);
}

/** Narration for an action id the world does not have at all. */
export function unknownActionNarration(id: string): string {
	return sentenceCase(`you do not know how to "${id}".`);
}
