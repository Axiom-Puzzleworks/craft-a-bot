import {
	actionsBrickSchema,
	llmBrickSchema,
	memoryBrickSchema,
	safetyBrickSchema,
	senseBrickSchema,
	toolsBrickSchema,
	type BrickKindDefinition
} from '@craftabot/core';
import { starterBricks } from './bricks.js';
import { qualifyPlayroomId } from './world/playroom.js';

/**
 * **The six V1 bricks, ported onto the open contract** (`14-…` §2, WP14).
 *
 * Each of these already existed twice over: as pure presentation data in
 * `bricks.ts`, and as a config shape hard-coded into `AgentSpec` in core. The
 * contract is what lets a pack own both halves — which is the difference
 * between "the box contains six bricks" and "the box contains six bricks *and
 * you can make a seventh*".
 *
 * The config schemas are the ones core already had, re-exported and attached to
 * their kind rather than redeclared: this slice is deliberately additive, so
 * the engine still reads the v1 spec and behaviour cannot change. The defaults
 * are the ones the workbench has been carrying in `BRICK_DEFAULTS`, brought
 * here so there is one answer to "what does a freshly-snapped brick do?".
 *
 * > **Amended 2026-08-13 (WP14 slice 3a):** the kinds now carry `describeFitted`
 * > and, where they have live behaviour, `createRuntime`. Both were previously
 * > `if` branches in core — `describeFittedBricks` knew all six bricks by name,
 * > and the loop read `spec.bricks.llm?.personality` directly. A seventh brick
 * > could join neither. The strings are moved verbatim, because slice 3's gate
 * > is that a golden trace stays byte-stable.
 */

/** The window sizes the Memory brick offers, spelled as the prompt says them. */
function describeMemory(config: { windowSize: number; notebook: boolean }): string {
	return config.notebook
		? `memory of your last ${config.windowSize} turns, and a notebook`
		: `memory of your last ${config.windowSize} turns`;
}

/** The presentation half, so the toy and real names are not written twice. */
function facesOf(id: string) {
	const brick = starterBricks.find((candidate) => candidate.id === id);
	if (!brick) throw new Error(`No brick presentation data for "${id}"`);
	return {
		name: brick.name,
		description: brick.description,
		realName: brick.realName,
		realExplanation: brick.realExplanation
	};
}

export const starterBrickKinds: BrickKindDefinition[] = [
	{
		id: 'starter/llm',
		slot: 'brain',
		...facesOf('starter/llm'),
		configSchema: llmBrickSchema,
		configVersion: 1,
		defaults: { cartridgeId: '', temperature: 0.7, maxTokens: 300, personality: '' },
		describeFitted: () => 'a brain (LLM)',
		/*
		 * The personality, and nothing else.
		 *
		 * The rest of this brick's config — cartridge, temperature, token budget —
		 * is not a *contribution*: it configures the call the engine makes rather
		 * than adding anything to the prompt. The brain is the one brick that
		 * drives the loop instead of contributing to it, so core reads those
		 * fields from the brick in the `brain` socket. Core knows a brain has a
		 * cartridge (it owns the slot families); it does not know which brain.
		 */
		createRuntime: (config: { personality: string }) => ({
			contributeContext: () =>
				config.personality.trim() === ''
					? {}
					: { sections: [`About you: ${config.personality.trim()}`] }
		})
	} as BrickKindDefinition,
	{
		id: 'starter/memory',
		slot: 'memory',
		...facesOf('starter/memory'),
		configSchema: memoryBrickSchema,
		configVersion: 1,
		defaults: { windowSize: 10, notebook: false },
		describeFitted: describeMemory
	} as BrickKindDefinition,
	{
		id: 'starter/tools',
		slot: 'equipment',
		...facesOf('starter/tools'),
		configSchema: toolsBrickSchema,
		configVersion: 1,
		defaults: { enabled: [] },
		// A belt with nothing on it is not worth telling the bot about.
		describeFitted: (config: { enabled: string[] }) =>
			config.enabled.length > 0 ? 'a tool belt' : ''
	} as BrickKindDefinition,
	{
		id: 'starter/sense',
		slot: 'perception',
		...facesOf('starter/sense'),
		configSchema: senseBrickSchema,
		configVersion: 1,
		defaults: { channels: [qualifyPlayroomId('sight'), qualifyPlayroomId('compass')] },
		describeFitted: (config: { channels: string[] }) => (config.channels.length > 0 ? 'senses' : '')
	} as BrickKindDefinition,
	{
		id: 'starter/actions',
		slot: 'mobility',
		...facesOf('starter/actions'),
		configSchema: actionsBrickSchema,
		configVersion: 1,
		defaults: {
			enabled: ['move', 'pick_up', 'put_down', 'give', 'open', 'say', 'celebrate'].map(
				qualifyPlayroomId
			)
		},
		describeFitted: (config: { enabled: string[] }) =>
			config.enabled.length > 0 ? 'hands and wheels' : ''
	} as BrickKindDefinition,
	{
		id: 'starter/safety',
		slot: 'safety',
		...facesOf('starter/safety'),
		configSchema: safetyBrickSchema,
		configVersion: 1,
		defaults: { maxTicks: 30, blockedActions: [], approvalMode: false, repeatLimit: 3 },
		describeFitted: () => 'a safety brick watching over you'
	} as BrickKindDefinition
];
