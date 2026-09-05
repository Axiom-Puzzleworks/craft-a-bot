/**
 * `@craftabot/desk` — the business-world runtime (WP53, `43-DESK-WORLDS.md`).
 * Depends on `@craftabot/core` and `zod` only.
 */
export {
	createDeskWorld,
	type DeskActionContext,
	type DeskActionOutcome,
	type DeskActionSpec,
	type DeskCase,
	type DeskLayoutSpec,
	type DeskSenseSpec,
	type DeskState,
	type DeskWorldDefinition,
	type DeskWorldSpec
} from './desk-world.js';
export { closest } from './closest.js';
export { DEFAULT_SEED, seededRandom, seedFrom } from './seeded.js';
export { runtimeStrings } from './strings.js';
