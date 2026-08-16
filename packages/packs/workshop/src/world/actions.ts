import type { RiskTier, WorldActionDefinition } from '@craftabot/core';
import { z } from 'zod';
import { actionStrings, narration } from '../strings.js';
import { ORTHOGONAL_DIRECTIONS, inBounds, step, withinReach } from './grid.js';
import { resolveByIdOrName, type WorkshopState } from './state.js';

/**
 * The Workshop's two actions (WP28). `move` is the Playroom's own rule,
 * unchanged. `paint` is the point of this pack: the first starter-adjacent
 * content anywhere with `riskTier: 'irreversible'` (`14-…` §4.5) — there is no
 * `unpaint`, so once it succeeds nothing in this world can undo it. Two
 * invariants match the Playroom's own (`pack-starter/world/actions.ts`): an
 * illegal action never throws and never mutates, and the clock advances
 * whether or not the action turns out to be legal.
 */

export type ActionOutcome = {
	ok: boolean;
	narration: string;
	stateDiff: { path: string; from: unknown; to: unknown }[];
};

function fail(message: string): ActionOutcome {
	return { ok: false, narration: message, stateDiff: [] };
}

function succeed(message: string, stateDiff: ActionOutcome['stateDiff']): ActionOutcome {
	return { ok: true, narration: message, stateDiff };
}

type ActionSpec<Schema extends z.ZodType> = {
	id: string;
	name: string;
	description: string;
	schema: Schema;
	riskTier: RiskTier;
	run: (state: WorkshopState, args: z.infer<Schema>) => ActionOutcome;
};

export type WorkshopAction = {
	definition: WorldActionDefinition;
	perform: (state: WorkshopState, args: unknown) => ActionOutcome;
};

function defineAction<Schema extends z.ZodType>(spec: ActionSpec<Schema>): WorkshopAction {
	return {
		definition: {
			id: spec.id,
			name: spec.name,
			description: spec.description,
			parameters: z.toJSONSchema(spec.schema),
			riskTier: spec.riskTier
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
	riskTier: 'observe',
	run: (state, args) => {
		const target = step(state.bot.position, args.direction);
		if (!inBounds(target, state.width, state.height)) {
			return fail(narration.blockedByWall(args.direction));
		}
		const blocker = state.furniture.find(
			(piece) => piece.position.x === target.x && piece.position.y === target.y
		);
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

const paint = defineAction({
	id: 'paint',
	name: actionStrings.paint.name,
	description: actionStrings.paint.description,
	schema: z.object({
		item: z.string().describe(actionStrings.paint.item),
		color: z.string().min(1).describe(actionStrings.paint.color)
	}),
	// The first content anywhere with this tier (`14-…` §4.5, WP28): once it
	// succeeds, nothing in this world — no rule, no action, no undo — reaches
	// it again.
	riskTier: 'irreversible',
	run: (state, args) => {
		const item = resolveByIdOrName(state.items, args.item);
		if (!item) return fail(narration.noSuchItem(args.item));
		if (item.location.kind !== 'floor') return fail(narration.outOfReach(item.name));
		if (!withinReach(state.bot.position, item.location.position)) {
			return fail(narration.outOfReach(item.name));
		}

		if (!state.bot.hasPaint) {
			return fail(narration.needsPaintPot);
		}

		if (item.painted) {
			return fail(narration.alreadyPainted(item.name, item.painted.color));
		}

		const from = item.painted;
		item.painted = { color: args.color };
		return succeed(narration.painted(item.name, args.color), [
			{ path: `items.${item.id}.painted`, from, to: { ...item.painted } }
		]);
	}
});

export const workshopActions: WorkshopAction[] = [move, paint];

export const workshopActionDefinitions: WorldActionDefinition[] = workshopActions.map(
	(action) => action.definition
);

export function findAction(id: string): WorkshopAction | undefined {
	return workshopActions.find((action) => action.definition.id === id);
}

export function unknownActionNarration(id: string): string {
	return `You do not know how to "${id}".`;
}
