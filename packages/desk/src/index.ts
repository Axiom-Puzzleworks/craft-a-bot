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
	type DeskTruth,
	type DeskWorldDefinition,
	type DeskWorldSpec
} from './desk-world.js';
export { closest } from './closest.js';
export {
	lastAgentLine,
	scriptedCounterpart,
	type ScriptedCounterpartOptions
} from './counterpart-brain.js';
export {
	advanceCounterpart,
	COUNTERPART_TRIGGER_KINDS,
	describeScriptProblems,
	freshCounterpartMemory,
	type CounterpartCue,
	type CounterpartMemory,
	type CounterpartRule,
	type CounterpartScript,
	type CounterpartThen,
	type CounterpartTrigger,
	type CounterpartTurn
} from './counterpart.js';
export { DEFAULT_SEED, seededRandom, seedFrom } from './seeded.js';
export { runtimeStrings } from './strings.js';
export {
	luhnCheckDigit,
	syntheticAccountNumber,
	syntheticAddress,
	syntheticEmail,
	syntheticIban,
	syntheticName,
	syntheticNiNumber,
	syntheticPan,
	syntheticPhone,
	syntheticSortCode,
	type SyntheticAddress,
	type SyntheticName
} from './synthetic.js';
