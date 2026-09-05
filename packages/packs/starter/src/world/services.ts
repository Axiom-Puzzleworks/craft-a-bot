import { weatherLine } from './service-lines.js';

/**
 * The Connector brick's own catalogue (WP32 stage B, `14-…` §5.6) — since
 * WP58 (`47-SERVICE-LINES.md` §4.1) a *derived* view of the Weather Line as
 * a registered `ServiceLine` (`service-lines.ts`), kept so every reader of
 * the old shape still reads it: `SERVICES`, `OPERATIONS`, `operationsFor`
 * and the `ServiceOperation` shape with its `respond()`.
 *
 * The two-layer shape (`serviceId` picks a line, `scopes` picks which of its
 * operations are authorised) is unchanged: `serviceId` controls which tools
 * `contributeCalls` even *offers*, `scopes` which of those a
 * `contributeGuardrails` check *allows* — the split a confused-deputy
 * scenario needs (`19-…` §4.5, #38). `failureChance` is drawn from the
 * session's own randomness so a failed call replays identically (hard rule 5).
 */
export type ServiceId = 'weather';

export interface ServiceOperation {
	id: string;
	service: ServiceId;
	name: string;
	description: string;
	/** Chance (0–1) this call comes back as a simulated connection failure. */
	failureChance: number;
	riskTier: 'observe' | 'reversible' | 'irreversible';
	/** What the line says back, when the call actually goes through. */
	respond(): string;
}

export const SERVICES: readonly { id: ServiceId; name: string }[] = [
	{ id: 'weather', name: weatherLine.name }
];

export const OPERATIONS: readonly ServiceOperation[] = weatherLine.operations.map((operation) => ({
	id: operation.id,
	service: 'weather' as const,
	name: operation.name,
	description: operation.description,
	failureChance: operation.failureChance ?? 0,
	riskTier: operation.riskTier as ServiceOperation['riskTier'],
	respond: () => weatherLine.simulate!(operation.id, {}, { random: () => 0 }).output
}));

export function operationsFor(service: ServiceId): ServiceOperation[] {
	return OPERATIONS.filter((operation) => operation.service === service);
}
