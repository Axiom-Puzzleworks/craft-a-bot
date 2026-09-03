import type { AgentSpecV2 } from '@craftabot/core';

/**
 * **The autonomy dial** (`14-…` §4.6's `autonomy`, `19-…` §8.1's levels;
 * WP52, `40-DEBTS.md` §4.1). A preset that, when picked, writes concrete
 * values into the fitted Safety Brick's `approval` and budgets and records
 * which level was picked — exactly as WP24 designed it and left unbuilt.
 * The engine keeps reading only `approval`, `maxTicks` and `maxTokens`.
 */

export const AUTONOMY_LEVELS = ['operator', 'collaborator', 'approver', 'observer'] as const;
export type AutonomyLevel = (typeof AUTONOMY_LEVELS)[number];

export interface AutonomyPreset {
	approval: 'off' | 'everything' | 'risky';
	maxTicks: number;
	maxTokens: number;
	blurb: string;
}

export const AUTONOMY_PRESETS: Record<AutonomyLevel, AutonomyPreset> = {
	operator: {
		approval: 'everything',
		maxTicks: 20,
		maxTokens: 20_000,
		blurb: 'A person confirms every call.'
	},
	collaborator: {
		approval: 'risky',
		maxTicks: 30,
		maxTokens: 50_000,
		blurb: 'Asks before anything it cannot undo; runs the rest.'
	},
	approver: {
		approval: 'risky',
		maxTicks: 60,
		maxTokens: 100_000,
		blurb: 'A longer leash, still asked about the risky calls.'
	},
	observer: {
		approval: 'off',
		maxTicks: 100,
		maxTokens: 200_000,
		blurb: 'Runs on its own; a person watches the trace.'
	}
};

const SAFETY_KIND = 'starter/safety';

/** What the fitted Safety Brick says now — read from the spec, never from a preset. */
export function autonomyOf(spec: AgentSpecV2): {
	fitted: boolean;
	level?: AutonomyLevel;
	approval?: string;
	maxTicks?: number;
	maxTokens?: number;
} {
	const safety = spec.bricks.find((brick) => brick.kind === SAFETY_KIND);
	if (!safety) return { fitted: false };
	const config = safety.config as {
		autonomy?: AutonomyLevel;
		approval?: string;
		maxTicks?: number;
		maxTokens?: number;
	};
	return {
		fitted: true,
		...(config.autonomy !== undefined ? { level: config.autonomy } : {}),
		...(config.approval !== undefined ? { approval: config.approval } : {}),
		...(config.maxTicks !== undefined ? { maxTicks: config.maxTicks } : {}),
		...(config.maxTokens !== undefined ? { maxTokens: config.maxTokens } : {})
	};
}

/**
 * The spec with the preset written into its first fitted Safety Brick, or
 * `undefined` when none is fitted — there is nothing to write into.
 */
export function applyAutonomy(spec: AgentSpecV2, level: AutonomyLevel): AgentSpecV2 | undefined {
	const index = spec.bricks.findIndex((brick) => brick.kind === SAFETY_KIND);
	if (index === -1) return undefined;
	const preset = AUTONOMY_PRESETS[level];
	const bricks = spec.bricks.map((brick, i) =>
		i === index
			? {
					...brick,
					config: {
						...(brick.config as Record<string, unknown>),
						autonomy: level,
						approval: preset.approval,
						maxTicks: preset.maxTicks,
						maxTokens: preset.maxTokens
					}
				}
			: brick
	);
	return { ...spec, bricks };
}
