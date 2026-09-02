import type { ToolDefinition } from '@craftabot/core';
import { z } from 'zod';
import { toolStrings } from '../strings.js';
import { OPERATIONS, type ServiceOperation } from '../world/services.js';

/**
 * The Connector brick's own tools (WP32 stage B, `14-…` §5.6) — one per
 * operation, not one tool with an `operation` argument, for the same reason
 * the Librarian's own tools are one per book (`tools/library.ts`'s own doc
 * comment): `ToolContext` carries nothing brick-specific, so a single tool's
 * own `execute()` would have no way to see which operations this bot's
 * Connector was actually configured to reach.
 *
 * Unlike the Librarian, `contributeCalls` offers every operation the
 * *connected service* has, regardless of `scopes` — the connection reaches
 * the whole line. `scopes` is enforced separately, by a `pre-act` guardrail
 * built from a tool *blocklist* (`brick-kinds.ts`'s own `connectorBrickKind`,
 * `@craftabot/governance`'s `createToolBlocklistGuardrail`), so an
 * unauthorised attempt is a visible, narrated refusal — "you tried, and a
 * rule stopped you" — rather than a tool that silently never existed. That
 * is the point of the brick: a confused-deputy defence has to catch a
 * misuse of *reach*, and there is nothing to catch if the reach itself was
 * never offered.
 */
const argsSchema = z.object({});

function connectorTool(operation: ServiceOperation): ToolDefinition {
	return {
		id: `starter/connector_${operation.service}_${operation.id}`,
		name: operation.name,
		description: operation.description,
		parameters: z.toJSONSchema(argsSchema),
		riskTier: operation.riskTier,
		execute(_rawArgs, context) {
			// The "simulated latency/failures" the row asks for — drawn from the
			// same deterministic channel `dice` uses, so a failed call replays
			// identically on re-run (hard rule 5).
			if (context.random() < operation.failureChance) {
				return { ok: false, output: toolStrings.connector.busy };
			}
			// A scenario may have overridden this tool's answer (WP44, `32-…` §4.2).
			const overrides = (
				context.worldState as { serviceOverrides?: Record<string, unknown> } | undefined
			)?.serviceOverrides;
			const override = overrides?.[`starter/connector_${operation.service}_${operation.id}`];
			if (override !== undefined) {
				return {
					ok: true,
					output: typeof override === 'string' ? override : JSON.stringify(override)
				};
			}
			return { ok: true, output: operation.respond() };
		}
	};
}

export const connectorTools: ToolDefinition[] = OPERATIONS.map(connectorTool);
