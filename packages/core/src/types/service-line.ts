import type { RiskTier } from '../schemas/risk-tier.js';
import type { CassetteFile } from '../schemas/cassette.js';
import type { BrickKindDefinition } from './brick.js';
import type { EgressDeclaration } from './guardrail-service.js';
import type { JsonSchema } from './json-schema.js';
import type { ToolResult } from './tool.js';
import type { WorldState } from './world.js';

/**
 * **A service line** (WP58, `47-SERVICE-LINES.md` §4.1; `41-…` §6.4):
 * something outside the toy a Connector brick can reach — a weather
 * service, a customer record system, a payment rail — as registered pack
 * content, the way a world or an evaluator is. A line names its operations
 * and answers them one of three ways: **simulated** from the world's own
 * state, deterministic; **recorded**, from a cassette replayed byte for
 * byte; or **live**, reaching a real sandbox under declared egress —
 * harness-only, used to record, never inside a session.
 *
 * The registry turns every operation into the `ToolDefinition` the session
 * already knows how to offer (`serviceLineTools`), under the id the Connector
 * brick has always named — so a pack ships lines, never tools for them.
 */
export interface ServiceOperation {
	/** Bare: `forecast`. The tool id is `${packId}/connector_${bareLine}_${id}`. */
	id: string;
	name: string;
	description: string;
	/** JSON Schema for the arguments; omitted means none. */
	parameters?: JsonSchema;
	riskTier: RiskTier;
	/** Chance (0–1) the call comes back as a simulated connection failure, drawn from the session's `random()`. */
	failureChance?: number;
}

export interface ServiceLineContext {
	/** A snapshot of the world, never the live state — a line reads the world, it does not act in it. */
	worldState?: Readonly<WorldState>;
	random(): number;
}

export interface ServiceLineLive {
	egress: EgressDeclaration[];
	credential?: BrickKindDefinition['credential'];
	/** From a live checkpoint; `false` until one has been taken. Omitted means unknown. */
	browserCapable?: boolean;
	call(
		op: string,
		args: unknown,
		deps: {
			fetch: typeof globalThis.fetch;
			getCredential(id: string): string | undefined;
			signal?: AbortSignal;
		}
	): Promise<ToolResult>;
}

export interface ServiceLine {
	/** Qualified like every other pack contribution: `starter/weather`, `fs-bank/crm`. */
	id: string;
	name: string;
	description: string;
	operations: ServiceOperation[];
	/** Simulated: answers from the world's own state, deterministic over `(state, args, random)`. */
	simulate?(op: string, args: unknown, ctx: ServiceLineContext): ToolResult;
	/** Recorded: answers from a cassette; a miss is a failed call with `errorKind: 'cassette-miss'`, never a live one. */
	cassette?: CassetteFile;
	/** Live: reaches a real sandbox — harness-only, under declared egress; what `craftabot record` runs. */
	live?: ServiceLineLive;
}
