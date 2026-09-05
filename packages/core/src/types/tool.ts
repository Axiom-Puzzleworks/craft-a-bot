import type { WorldState } from './world.js';
import type { ToolMetadata } from '../schemas/pack-manifest.js';

/**
 * Tools (02-AGENT-MODEL.md §2.3) — function calling. The world-mutating
 * counterpart is an *action*; tools compute, remember, and look things up but
 * never change the world, which is the distinction the Tools brick teaches.
 *
 * `ToolMetadata` (Zod, in schemas/pack-manifest.ts) is the pure-data half that
 * crosses the manifest boundary; this adds the behaviour, exactly as
 * `WorldDefinition` and `GuardrailDefinition` do.
 */

export interface ToolContext {
	tick: number;
	/** The Memory brick's notebook. Absent notebook ⇒ `requiresNotebook` tools are not offered. */
	notebook: NotebookAccess;
	/**
	 * The only sanctioned source of randomness in the whole engine (hard rule 5).
	 * Injected so a recorded run replays identically.
	 */
	random(): number;
	/**
	 * A snapshot of the world the tool acts in (`32-SCENARIOS.md` §4.1 D-a,
	 * WP44). Two of a scenario's injection kinds — a manual entry, a tool's
	 * answer — land in state that only a tool reads, and a tool had never seen
	 * the world; a world-specific tool reads what it recognises and ignores
	 * the rest. Optional: a host that predates the seam hands nothing.
	 */
	worldState?: Readonly<WorldState>;
}

export interface NotebookAccess {
	read(): string[];
	append(line: string): void;
}

export interface ToolResult {
	ok: boolean;
	/** What the agent is told, in plain language — this goes back into the prompt. */
	output: string;
	/** Anything structured the trace should show alongside the text. */
	data?: unknown;
	/**
	 * Why a failed call failed, in a fixed word a trace reader can filter on
	 * (WP58, `47-SERVICE-LINES.md` §4.1): `'cassette-miss'` for a service
	 * line with no recorded answer. The session puts an `error` event with
	 * this `kind` beside the `tool.executed`, the way an egress refusal is
	 * `'egress-refused'`. Absent on a success and on an ordinary failure.
	 */
	errorKind?: string;
}

export interface ToolDefinition extends ToolMetadata {
	execute(args: unknown, context: ToolContext): Promise<ToolResult> | ToolResult;
}
