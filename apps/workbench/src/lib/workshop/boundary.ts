import type { AnyAgentSpec, EngineEvent, PackRegistry } from '@craftabot/core';
import {
	boundaryMapFor,
	type BoundaryMap,
	type BoundaryOptions
} from '@craftabot/governance/reports';
import { sinksStore } from '$lib/state/sinks.svelte.js';

/**
 * The Workshop's side of the Boundary map (WP57 stage C, `44-…` §4.5): the
 * fold is `governance`'s; what the host adds is the sinks it has
 * configured, which are not registry content (`35-…`) and so cannot be
 * found from the spec. Each enabled sink is asked what hosts its own
 * configuration reaches.
 */
export function configuredSinksForBoundary(): NonNullable<BoundaryOptions['sinks']> {
	return sinksStore.instances().map(({ sink }) => {
		const configuration = sinksStore.configurations.find((entry) => entry.sinkId === sink.id);
		return {
			id: sink.id,
			name: sink.name,
			egress: sink.egress(configuration?.config ?? {}),
			...(sink.credential ? { credential: sink.credential.id } : {})
		};
	});
}

export function boundaryFor(
	spec: AnyAgentSpec,
	registry: PackRegistry,
	events?: readonly EngineEvent[]
): BoundaryMap {
	return boundaryMapFor(spec, registry, {
		sinks: configuredSinksForBoundary(),
		...(events ? { events } : {})
	});
}
