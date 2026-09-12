import { z } from 'zod';
import {
	pointHook,
	stampComponent,
	type ComponentCost,
	type ComponentVerdictKind,
	type Connection,
	type GuardrailComponent,
	type GuardrailService
} from '@craftabot/core';
import { hostedScreenConfigSchema } from '../hosted/config.js';
import { createHostedGuardrails } from '../hosted/guardrails.js';

/**
 * **The `guard-service` adapter** (WP94, `85-COMPONENTS.md` §5): a
 * `GuardrailService` as a component — the adapter *is* `createHostedGuardrails`,
 * with the Guard brick's own id prefix and envelope so the chain a component
 * compiles is byte-for-byte the chain the brick fits. The connection is the
 * service's declaration read as one; the cost class follows the connection.
 */
export const GUARD_BRICK_ID_PREFIX = 'workshop/guard';

export const guardServiceComponentSchema = z.object({
	/** The service's own config, parsed by its `configSchema` at compile. */
	serviceConfig: z.unknown().optional(),
	screening: hostedScreenConfigSchema.prefault({}),
	/** The guardrail ids' prefix — the Guard brick's, so a component's chain equals the brick's. */
	idPrefix: z.string().min(1).default(GUARD_BRICK_ID_PREFIX)
});
export type GuardServiceComponentConfig = z.infer<typeof guardServiceComponentSchema>;

export interface GuardServiceComponentOptions {
	/** The catalogue entry the service implements (`86-…`); `input-classifier` by default. */
	technique?: string;
	wraps: string;
	kind?: Connection['kind'];
	browserCapable?: Connection['browserCapable'];
	checkpoint?: Connection['checkpoint'];
	version?: string;
	perCall?: string;
}

function connectionFor(
	service: GuardrailService,
	options: GuardServiceComponentOptions
): Connection {
	const kind = options.kind ?? 'hosted';
	return {
		kind,
		wraps: options.wraps,
		...(service.credential ? { credential: service.credential.id } : {}),
		egress: [...service.egress],
		browserCapable: options.browserCapable ?? service.browserCapable ?? true,
		standIn: 'offline-fixture',
		...(options.checkpoint ? { checkpoint: options.checkpoint } : {}),
		...(options.version ? { version: options.version } : {})
	};
}

function costFor(kind: Connection['kind'], perCall: string | undefined): ComponentCost {
	if (kind === 'local') return { class: 'local-compute', latency: 'local' };
	if (kind === 'policy-engine') return { class: 'local-compute', latency: 'network' };
	return { class: 'metered', latency: 'network', ...(perCall ? { perCall } : {}) };
}

/** A service as a component: the id is the service's own, the points its hooks, the verdicts what the shell's mapping can give. */
export function guardServiceComponent(
	service: GuardrailService,
	options: GuardServiceComponentOptions
): GuardrailComponent<GuardServiceComponentConfig> {
	const kind = options.kind ?? 'hosted';
	const verdicts: ComponentVerdictKind[] = [
		'allow',
		'block-action',
		'stop-run',
		'pause',
		'annotate'
	];
	if (kind !== 'policy-engine') verdicts.push('redact');
	return {
		id: service.id,
		name: service.name,
		description: service.description,
		technique: options.technique ?? 'input-classifier',
		points: [...service.hooks],
		verdicts,
		cost: costFor(kind, options.perCall),
		connection: connectionFor(service, options),
		configSchema: guardServiceComponentSchema,
		explain: (config) =>
			`Sends what the bot sees, decides and does to ${options.wraps}${config.screening.offline ? ' (the stand-in)' : ''}; a match ${config.screening.screenDecision === 'ask' ? 'asks a person' : config.screening.screenDecision === 'stop' ? 'stops the run' : config.screening.screenDecision === 'block' ? 'blocks the move' : 'is noted'}.`,
		compile: (config, deps, point) => {
			const parsed = service.configSchema.safeParse(config.serviceConfig ?? {});
			if (!parsed.success)
				throw new Error(`${service.id} refuses its config: ${parsed.error.message}`);
			const screening = {
				...config.screening,
				offline: config.screening.offline || deps.screening?.offline === true
			};
			const guardrails = createHostedGuardrails({
				idPrefix: config.idPrefix,
				service,
				serviceConfig: parsed.data,
				screening,
				ctx: {
					fetch:
						deps.fetch ??
						(() =>
							Promise.reject(new Error(`${service.id}: no fetch was handed to the component`))),
					getCredential: deps.getCredential ?? (() => undefined)
				},
				envelope: (guardCtx) => ({ agentId: guardCtx.spec.id, tick: guardCtx.tick })
			});
			// A component at a loop point is that point's guardrail alone (`85-…` §4): a stack fits the service once per point it wants.
			const hook = pointHook(point);
			return stampComponent(
				hook ? guardrails.filter((guardrail) => guardrail.hooks.includes(hook)) : guardrails,
				service.id,
				point
			);
		}
	};
}
