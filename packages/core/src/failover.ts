import type { ChatResponse } from './schemas/shared.js';
import type { EgressDeclaration } from './types/guardrail-service.js';
import type { KeyCheck, LLMProvider } from './types/provider.js';

/**
 * **Dependency failover** (WP148, `110-CONTROL-SUITE-PLAN.md` §10; PRA
 * SS1/21's important services): a provider in front of several, asking each
 * in turn until one answers. A failure of a kind that warrants failover — the
 * service unavailable, slow, rate-limited — moves on to the next; anything
 * else, and a cancelled call, is the caller's to handle and is rethrown. The
 * answer says who served it and who failed before (`ChatResponse.servedBy`),
 * so `think.completed` carries the failover. The DGX pack's two units were
 * the first instance; this is the same idea over any providers.
 */
export const FAILOVER_KINDS: readonly string[] = [
	'unavailable',
	'timeout',
	'rate-limited',
	'server-error',
	'network'
];

const kindOf = (error: unknown): string =>
	error !== null && typeof error === 'object' && 'kind' in error && typeof error.kind === 'string'
		? error.kind
		: 'engine';

export interface FailoverOptions {
	/** The failover provider's own id; `failover:<ids>` by default. */
	id?: string;
	/** The failure kinds that move to the next provider; `FAILOVER_KINDS` by default. */
	kinds?: readonly string[];
}

export function failoverProvider(
	providers: readonly LLMProvider[],
	options: FailoverOptions = {}
): LLMProvider {
	if (providers.length === 0) throw new Error('failover needs at least one provider');
	const kinds = new Set(options.kinds ?? FAILOVER_KINDS);
	const egress: EgressDeclaration[] = providers.flatMap((provider) => provider.egress ?? []);
	const first = providers[0]!;
	return {
		id: options.id ?? `failover:${providers.map((provider) => provider.id).join('+')}`,
		name: `Failover over ${providers.map((provider) => provider.name).join(', ')}`,
		keyRequirement: providers.some((provider) => provider.keyRequirement === 'required')
			? 'required'
			: 'none',
		egress,
		...(first.supports ? { supports: first.supports } : {}),
		validateKey: (key): Promise<KeyCheck> => first.validateKey(key),
		async chat(request, opts): Promise<ChatResponse> {
			const failedOver: Array<{ providerId: string; kind: string }> = [];
			let last: unknown;
			for (const provider of providers) {
				try {
					const response = await provider.chat(request, opts);
					return { ...response, servedBy: { providerId: provider.id, failedOver } };
				} catch (error) {
					if (opts.signal.aborted || !kinds.has(kindOf(error))) throw error;
					failedOver.push({ providerId: provider.id, kind: kindOf(error) });
					last = error;
				}
			}
			throw last;
		}
	};
}
