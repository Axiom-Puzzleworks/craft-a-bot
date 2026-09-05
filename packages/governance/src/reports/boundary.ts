import {
	capabilitiesOf,
	hostMatches,
	migrateBrickConfig,
	toSpecV2,
	type AnyAgentSpec,
	type EgressDeclaration,
	type EgressMode,
	type EngineEvent,
	type PackRegistry,
	type RiskTier,
	type SlotId,
	type WorldViewKind
} from '@craftabot/core';

/**
 * **The Boundary map** (WP57 stage C, `44-CONTROL-ROOM.md` §4.5; `41-…`
 * §6.15): the agent at the centre of its workflow inside an execution
 * boundary — the safety stack, the egress gate, the approval gate — with
 * the world and any counterpart inside, and the provider, the guard
 * services, the evaluators and the sinks outside, each edge labelled with
 * the hosts it reaches and what it sends. Folded from the spec, the
 * registry and (when given) the trace — never from the engine's live
 * objects (hard rule 3). Pure; snapshot-tested over the golden traces.
 *
 * `service-line`, `pdp` and `evidence-store` are reserved kinds: nothing
 * registers them yet (WP58, WP70; the OPA pack is a `guard-service`), and
 * the shape is fixed now so the map does not change when they arrive.
 * `human.principal` waits for WP65's field.
 */

export type BoundaryOutsideKind =
	'provider' | 'guard-service' | 'evaluator' | 'sink' | 'service-line' | 'pdp' | 'evidence-store';

/** One thing outside the boundary the build reaches, with the hosts and the payload kinds its edge carries. */
export interface BoundaryOutside {
	kind: BoundaryOutsideKind;
	id: string;
	name: string;
	hosts: string[];
	sends: string[];
	/** The credential id the edge carries, when the component needs one. */
	credential?: string;
}

/** One crossing of an edge at a tick — what the scrubber lights. */
export interface BoundaryActivity {
	tick: number;
	/** `provider`, `guard-service:<id>`, `human`, `world`, `counterpart:<agentId>`, `sink:<id>`. */
	edge: string;
	eventId: string;
	/** A verdict the fold attaches: `outside-egress` when a host was reached that the run had not declared. */
	verdict?: string;
	/** The event's own outcome where it has one (`guardrail.external`). */
	outcome?: string;
}

/** The map, v1: the agent, the ring, what is inside it, what is outside it, the human, and (over a trace) the activity. */
export interface BoundaryMap {
	schemaVersion: 1;
	agent: {
		id: string;
		name: string;
		bricks: Array<{ slot: SlotId; kindId: string; name: string }>;
	};
	boundary: {
		safetyStack: Array<{ kindId: string; name: string }>;
		/** Every rule the fitted bricks install — the stack as a whole; a per-brick attribution is not on the trace. */
		guardrailIds: string[];
		egress: { mode?: EgressMode; hosts: string[] };
		approval: { mode: 'off' | 'everything' | 'risky'; autonomy?: string; riskTiers: RiskTier[] };
	};
	inside: {
		world: { id: string; name: string; view: WorldViewKind } | undefined;
		/** Every other seat of a group episode, named from its own `run.started` and given its role (WP55) when `group.started` says. */
		counterparts: Array<{ agentId: string; name: string; role?: 'agent' | 'counterpart' }>;
	};
	outside: BoundaryOutside[];
	human: { approvals: number; principal?: undefined };
	activity?: BoundaryActivity[];
}

/** What a host adds to the fold: the trace, the sinks it has configured, the evaluators it will run. */
export interface BoundaryOptions {
	events?: readonly EngineEvent[];
	/** Sinks the host has configured — not registry content (`35-…`). */
	sinks?: ReadonlyArray<{
		id: string;
		name: string;
		egress: EgressDeclaration[];
		credential?: string;
	}>;
	/** Evaluator ids the host will run — a build does not name evaluators; a campaign does. */
	evaluators?: readonly string[];
	/** The other seats' display names by agent id (WP55, `46-…` §4.6) — the trace carries none; the host's run records do. */
	names?: Readonly<Record<string, string>>;
}

const SAFETY_APPROVAL_KIND = 'starter/safety';

function hostOf(url: string): string | undefined {
	try {
		return new URL(url).host;
	} catch {
		return undefined;
	}
}

function hostsOf(egress: readonly EgressDeclaration[] | undefined): string[] {
	return [...new Set((egress ?? []).map((declaration) => declaration.host))];
}

function sendsOf(egress: readonly EgressDeclaration[] | undefined): string[] {
	return [...new Set((egress ?? []).flatMap((declaration) => declaration.sends))];
}

/** Fold a `BoundaryMap` from a spec, a registry and (optionally) a trace and the host's own additions. Pure. */
export function boundaryMapFor(
	spec: AnyAgentSpec,
	registry: PackRegistry,
	options: BoundaryOptions = {}
): BoundaryMap {
	const v2 = toSpecV2(spec);
	const events = options.events ?? [];
	const capabilities = capabilitiesOf(spec, registry);

	const bricks = v2.bricks.map((brick) => ({
		slot: brick.slot,
		kindId: brick.kind,
		name: registry.getBrickKind(brick.kind)?.name ?? brick.kind
	}));

	const safety = v2.bricks.filter((brick) => brick.slot === 'safety');
	const safetyStack = safety.map((brick) => ({
		kindId: brick.kind,
		name: registry.getBrickKind(brick.kind)?.name ?? brick.kind
	}));

	const approvalBrick = safety.find((brick) => brick.kind === SAFETY_APPROVAL_KIND);
	const approvalKind = approvalBrick ? registry.getBrickKind(approvalBrick.kind) : undefined;
	// Read at the kind's current config version: a v1 spec's `approvalMode` becomes the three-way dial here.
	const approvalConfig = (
		approvalBrick && approvalKind
			? migrateBrickConfig(approvalBrick.config, approvalBrick.configVersion, approvalKind)
			: {}
	) as { approval?: unknown; autonomy?: unknown; approvalMode?: unknown };
	// A v1 config a kind without a migration hands back still says what it meant.
	const approvalMode =
		approvalConfig.approval === 'everything' || approvalConfig.approval === 'risky'
			? approvalConfig.approval
			: approvalConfig.approvalMode === true
				? 'everything'
				: 'off';
	const riskTiers: RiskTier[] =
		approvalMode === 'everything'
			? ['observe', 'reversible', 'irreversible']
			: approvalMode === 'risky'
				? ['irreversible']
				: [];

	// ---- outside: what the build reaches
	const outside: BoundaryOutside[] = [];
	const cartridge = registry.getCartridge(capabilities.cartridgeId);
	const factory = cartridge ? registry.getProviderFactory(cartridge.providerId) : undefined;
	if (factory) {
		outside.push({
			kind: 'provider',
			id: factory.id,
			name: factory.name,
			hosts: hostsOf(factory.egress),
			sends: sendsOf(factory.egress),
			...(factory.keyRequirement === 'required' ? { credential: factory.id } : {})
		});
	} else if (cartridge) {
		// A provider no factory registers (the Kit's Demo Brain): named, local, sends nothing anywhere.
		outside.push({
			kind: 'provider',
			id: cartridge.providerId,
			name: cartridge.providerId,
			hosts: [],
			sends: []
		});
	}
	const declaredHosts = new Set<string>(hostsOf(factory?.egress));
	for (const brick of v2.bricks) {
		// A brick kind declares egress on its *runtime*, per config (WP41), so a
		// build's hosts come from the services and the provider it names.
		// The generic Guard brick names a service in its config; the Armour brick's kind names its own.
		const named = (brick.config as { serviceId?: unknown } | undefined)?.serviceId;
		const serviceIds = new Set<string>();
		if (typeof named === 'string' && named !== '') serviceIds.add(named);
		// A pack's own safety brick over its own service (the Armour brick over
		// Model Armor): a safety brick from pack P reaches the one service P ships.
		if (brick.slot === 'safety') {
			const pack = brick.kind.split('/')[0];
			const own = registry.listGuardrailServices().filter((s) => s.id.split('/')[0] === pack);
			if (own.length === 1 && own[0]) serviceIds.add(own[0].id);
		}
		for (const id of serviceIds) {
			const service = registry.getGuardrailService(id);
			if (!service || outside.some((entry) => entry.kind === 'guard-service' && entry.id === id))
				continue;
			outside.push({
				kind: 'guard-service',
				id: service.id,
				name: service.name,
				hosts: hostsOf(service.egress),
				sends: sendsOf(service.egress),
				...(service.credential ? { credential: service.credential.id } : {})
			});
			for (const host of hostsOf(service.egress)) declaredHosts.add(host);
		}
	}
	for (const id of options.evaluators ?? []) {
		const evaluator = registry.getEvaluator(id);
		if (!evaluator) continue;
		outside.push({
			kind: 'evaluator',
			id: evaluator.id,
			name: evaluator.name,
			hosts: hostsOf(evaluator.egress),
			sends: sendsOf(evaluator.egress)
		});
	}
	for (const sink of options.sinks ?? []) {
		outside.push({
			kind: 'sink',
			id: sink.id,
			name: sink.name,
			hosts: hostsOf(sink.egress),
			sends: sendsOf(sink.egress),
			...(sink.credential ? { credential: sink.credential } : {})
		});
		for (const host of hostsOf(sink.egress)) declaredHosts.add(host);
	}

	// ---- the trace, when given
	const started = events.find((event) => event.type === 'run.started');
	const runEgress = started?.type === 'run.started' ? started.payload.egress : undefined;
	const egress: BoundaryMap['boundary']['egress'] = runEgress
		? { mode: runEgress.mode, hosts: [...runEgress.hosts] }
		: { hosts: [...declaredHosts].sort() };

	const goalCard = registry.getGoalCard(v2.goalCardId);
	const world = goalCard ? registry.getWorld(goalCard.worldId) : undefined;

	const group = events.find((event) => event.type === 'group.started');
	const counterparts: BoundaryMap['inside']['counterparts'] = [];
	if (group?.type === 'group.started') {
		for (const agentId of group.payload.memberAgentIds) {
			if (agentId === v2.id) continue;
			// Named by the host (its run records know), given its role by the trace (WP55, `46-…` §4.6).
			const name = options.names?.[agentId] ?? agentId;
			const role = group.payload.memberRoles?.[agentId];
			counterparts.push({ agentId, name, ...(role !== undefined ? { role } : {}) });
		}
	}

	const approvals = events.filter((event) => event.type === 'approval.requested').length;

	const activity: BoundaryActivity[] = [];
	if (options.events) {
		const allowed = (host: string | undefined): boolean =>
			host === undefined ||
			egress.mode === undefined ||
			egress.hosts.some((p) => hostMatches(p, host));
		for (const event of events) {
			const base = { tick: event.tick, eventId: event.id };
			switch (event.type) {
				case 'think.completed':
					activity.push({ ...base, edge: 'provider' });
					break;
				case 'guardrail.external': {
					const service = outside.find(
						(entry) =>
							entry.kind === 'guard-service' &&
							(entry.id === event.payload.service || entry.id.endsWith(`/${event.payload.service}`))
					);
					const host = hostOf(event.payload.endpoint);
					const reached = event.payload.outcome !== 'offline';
					activity.push({
						...base,
						edge: `guard-service:${service?.id ?? event.payload.service}`,
						outcome: event.payload.outcome,
						...(reached && !allowed(host) ? { verdict: 'outside-egress' } : {})
					});
					break;
				}
				case 'approval.requested':
				case 'approval.resolved':
					activity.push({ ...base, edge: 'human' });
					break;
				case 'sense':
				case 'action.performed':
					if (
						group?.type === 'group.started' &&
						event.agentId !== undefined &&
						event.agentId !== v2.id
					) {
						activity.push({ ...base, edge: `counterpart:${event.agentId}` });
					} else {
						activity.push({ ...base, edge: 'world' });
					}
					break;
				default:
					break;
			}
		}
	}

	return {
		schemaVersion: 1,
		agent: { id: v2.id, name: v2.name, bricks },
		boundary: {
			safetyStack,
			guardrailIds: [...capabilities.guardrailIds],
			egress,
			approval: {
				mode: approvalMode,
				...(typeof approvalConfig.autonomy === 'string'
					? { autonomy: approvalConfig.autonomy }
					: {}),
				riskTiers
			}
		},
		inside: {
			world: world ? { id: world.id, name: world.name, view: world.view ?? 'grid' } : undefined,
			counterparts
		},
		outside,
		human: { approvals },
		...(options.events ? { activity } : {})
	};
}

/** The edges lit at a tick — what the scrubber asks. */
export function litEdgesAt(map: BoundaryMap, tick: number): Set<string> {
	return new Set(
		(map.activity ?? []).filter((entry) => entry.tick === tick).map((entry) => entry.edge)
	);
}
