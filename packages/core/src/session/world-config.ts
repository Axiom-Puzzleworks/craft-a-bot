import type { GoalCardDefinition } from '../schemas/pack-manifest.js';

/**
 * **The card's dial, as the world reads it** (WP131, `109-THE-TAIL-DAY7.md`
 * §3): the player's setting (`AgentSpecV2.goalDial`) clamped to the dial and
 * snapped to its step, or the dial's default, handed to the world at
 * `create` as `config.knobs[knob]` — one function for the session, the
 * group and a fork, so all three build the same world. A card with no dial
 * gets nothing, and its world is created exactly as before.
 */
export function goalDialFor(
	card: GoalCardDefinition,
	setting: number | undefined
): { knob: string; value: number } | undefined {
	const dial = card.dial;
	if (!dial) return undefined;
	const raw = setting ?? dial.default;
	const clamped = Math.min(dial.max, Math.max(dial.min, Number.isFinite(raw) ? raw : dial.default));
	const steps = Math.round((clamped - dial.min) / dial.step);
	// Rounded to the step's own precision, so 0.1 + 0.2 never reaches the world as 0.30000000000000004.
	const decimals = (String(dial.step).split('.')[1] ?? '').length;
	const value = Number((dial.min + steps * dial.step).toFixed(decimals));
	return { knob: dial.knob, value: Math.min(dial.max, value) };
}

/** The `create` options' `config` for a card and a setting: `{ knobs: { [knob]: value } }`, or nothing. */
export function worldConfigFor(
	card: GoalCardDefinition,
	setting: number | undefined
): { config: Record<string, unknown> } | Record<string, never> {
	const dial = goalDialFor(card, setting);
	return dial ? { config: { knobs: { [dial.knob]: dial.value } } } : {};
}
