import { replayFromCassette } from './schemas/cassette.js';
import type { ServiceLine, ServiceOperation } from './types/service-line.js';
import type { ToolDefinition, ToolResult } from './types/tool.js';

/**
 * **The tools a service line becomes** (WP58, `47-SERVICE-LINES.md` §4.1):
 * one `ToolDefinition` per operation, synthesised by the registry at
 * `registerPack` under `${packId}/connector_${bareLine}_${op}` — the id
 * the Connector brick has named since WP32 (`starter/weather` +
 * `forecast` → `starter/connector_weather_forecast`), so every trace and
 * plan written before is unchanged.
 *
 * An operation answers in one fixed order: the failure draw; the world's
 * override (a scenario's `tool-result` injection — `serviceOverrides` in
 * the Playroom, `toolOverrides` on a desk); `simulate`; the cassette; a
 * loud miss. Never `live` — a session's tool has no `fetch`, by
 * construction, and the miss says `errorKind: 'cassette-miss'` so the
 * session puts it on the trace as an `error`.
 */
export const CASSETTE_MISS = 'cassette-miss';

export const serviceLineStrings = {
	busy: 'The line is busy — try again in a moment.',
	miss: (line: string, op: string) =>
		`The ${line} line has no recorded answer for "${op}" with these arguments — nothing was sent, and a person needs to re-record it.`,
	noAnswer: (line: string, op: string) =>
		`The ${line} line cannot answer "${op}" offline — it has neither a simulation nor a recording.`
} as const;

/** `starter/weather` → `weather`. */
export function bareLineId(lineId: string): string {
	const slash = lineId.lastIndexOf('/');
	return slash === -1 ? lineId : lineId.slice(slash + 1);
}

export function serviceLineToolId(packId: string, lineId: string, opId: string): string {
	return `${packId}/connector_${bareLineId(lineId)}_${opId}`;
}

/** What `z.toJSONSchema(z.object({}))` gave the Connector's tools since WP32 — byte for byte, so a prompt that lists tool schemas is unchanged. */
const NO_ARGS = {
	$schema: 'https://json-schema.org/draft/2020-12/schema',
	type: 'object',
	properties: {},
	additionalProperties: false
};

function overrideFor(worldState: unknown, toolId: string): unknown {
	const state = worldState as
		| { serviceOverrides?: Record<string, unknown>; toolOverrides?: Record<string, unknown> }
		| undefined;
	return state?.serviceOverrides?.[toolId] ?? state?.toolOverrides?.[toolId];
}

function serviceLineTool(
	packId: string,
	line: ServiceLine,
	operation: ServiceOperation
): ToolDefinition {
	const id = serviceLineToolId(packId, line.id, operation.id);
	return {
		id,
		name: operation.name,
		description: operation.description,
		parameters: operation.parameters ?? NO_ARGS,
		riskTier: operation.riskTier,
		async execute(args, context): Promise<ToolResult> {
			// The failure draw first, from the same deterministic channel `dice`
			// uses, so a failed call replays identically (hard rule 5).
			if (operation.failureChance !== undefined && context.random() < operation.failureChance) {
				return { ok: false, output: serviceLineStrings.busy };
			}
			const override = overrideFor(context.worldState, id);
			if (override !== undefined) {
				return {
					ok: true,
					output: typeof override === 'string' ? override : JSON.stringify(override)
				};
			}
			if (line.simulate) {
				return line.simulate(operation.id, args, {
					random: context.random,
					...(context.worldState !== undefined ? { worldState: context.worldState } : {})
				});
			}
			if (line.cassette) {
				const replayed = await replayFromCassette(line.cassette, operation.id, args);
				if (replayed) return replayed;
				return {
					ok: false,
					output: serviceLineStrings.miss(line.name, operation.id),
					errorKind: CASSETTE_MISS
				};
			}
			return {
				ok: false,
				output: serviceLineStrings.noAnswer(line.name, operation.id),
				errorKind: CASSETTE_MISS
			};
		}
	};
}

/** Every operation of a line as the tool the session offers. */
export function serviceLineTools(packId: string, line: ServiceLine): ToolDefinition[] {
	return line.operations.map((operation) => serviceLineTool(packId, line, operation));
}
