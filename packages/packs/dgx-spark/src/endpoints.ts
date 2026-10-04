import type { EgressDeclaration } from '@craftabot/core';

/**
 * **The two DGX Sparks** (`99-DGX-SPARK.md` §2): two NVIDIA DGX Spark units
 * on the builder's own network, each serving vLLM's OpenAI-compatible API
 * on port 8000. They are independent servers, not a cluster. Whichever
 * *mode* a unit is in decides which model it serves, and under which name
 * (§3). Each unit is reachable by its LAN name and by its Tailscale address
 * when away from home.
 *
 * These four hosts are the pack's whole egress: the session's guard refuses
 * any other (WP41), and a host endpoint is honoured only when it names one
 * of them (`describeSparkEndpoint`). They are fixed here rather than typed
 * into Settings, for the same reason `pack-ollama` fixes its loopback
 * (`40-DEBTS.md` §4.3). An address outside the list must be a reviewed
 * change to this file, never a field anyone can fill in.
 */
export interface SparkUnit {
	id: 'spark-619c' | 'spark-ef08';
	/** The `ssh` alias the builder reaches it by, for `craftabot spark` (the Spark project's own `spark1`/`spark2`). */
	ssh: string;
	/** The name the unit has on the LAN. */
	lan: string;
	/** Its Tailscale address, for use away from home. */
	tailscale: string;
}

export const SPARK_UNITS: readonly SparkUnit[] = [
	{ id: 'spark-619c', ssh: 'spark1', lan: 'spark-619c', tailscale: '100.119.19.90' },
	{ id: 'spark-ef08', ssh: 'spark2', lan: 'spark-ef08', tailscale: '100.103.182.73' }
];

export type SparkUnitId = SparkUnit['id'];

export const SPARK_PORT = 8000;

/** Which unit a host (its LAN name or its Tailscale address) belongs to. */
export const unitOfHost = (host: string): SparkUnit | undefined =>
	SPARK_UNITS.find((unit) => unit.lan === host || unit.tailscale === host);

const HOSTS = SPARK_UNITS.flatMap((unit) => [unit.lan, unit.tailscale]);

/** Where this pack sends bytes: the prompt to the provider, the caller's words to the classifier. */
export const SPARK_EGRESS: EgressDeclaration[] = HOSTS.map((host) => ({
	host,
	purpose: 'LLM completions and classifications on the builder’s own DGX Spark',
	sends: ['prompt', 'observation']
}));

export const baseUrlOf = (host: string): string => `http://${host}:${SPARK_PORT}/v1`;

/**
 * The order in which the units are tried: each unit's LAN name, then each
 * Tailscale address. A preferred host goes first. A unit that is down, or
 * in a mode that doesn't serve the model, is skipped for the next
 * (`transport.ts`).
 */
export function sparkBaseUrls(prefer?: string): string[] {
	const order = [
		...SPARK_UNITS.map((unit) => unit.lan),
		...SPARK_UNITS.map((unit) => unit.tailscale)
	];
	const first = prefer !== undefined ? hostOf(prefer) : undefined;
	const hosts =
		first && order.includes(first) ? [first, ...order.filter((h) => h !== first)] : order;
	return hosts.map(baseUrlOf);
}

function hostOf(endpoint: string): string | undefined {
	try {
		return new URL(endpoint.includes('://') ? endpoint : `http://${endpoint}`).hostname;
	} catch {
		return undefined;
	}
}

/** Why an endpoint is refused, or `undefined` when it names one of the two units. */
export function describeSparkEndpoint(endpoint: string): string | undefined {
	const host = hostOf(endpoint.trim());
	if (host === undefined) return 'That is not a web address.';
	if (!HOSTS.includes(host)) {
		return `Only the two DGX Sparks are allowed: ${HOSTS.join(', ')}.`;
	}
	return undefined;
}

export const isSparkEndpoint = (endpoint: string): boolean =>
	describeSparkEndpoint(endpoint) === undefined;
