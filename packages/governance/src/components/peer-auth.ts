import { z } from 'zod';
import {
	canonicalJson,
	sha256Hex,
	stampComponent,
	type Guardrail,
	type GuardrailComponent
} from '@craftabot/core';

/**
 * **Inter-agent message authentication** (WP143, `110-CONTROL-SUITE-PLAN.md`
 * §10; OWASP ASI07). A message between seats carries its sender (`from`, the
 * engine's own attribution) and a digest over the sender, the channel, the
 * words and the tick, stamped by the world when a seat really sends it. At
 * `pre-think`, before the bot reasons over what it heard, `governance/peer-auth`
 * checks every message in view: its sender is a seat in the room, and its
 * digest is the digest of what it says. A message injected onto the channel —
 * a scenario's, a compromised tool's — claiming a teammate's name has no seat
 * behind it, or no digest, and fails.
 *
 * **What this is, honestly:** integrity over an attribution the engine makes,
 * not a cryptographic signature. In the simulator the engine is the only
 * thing that can stamp a sender, so the digest catches a message altered or
 * forged after the fact; a deployment between separate processes needs keys
 * (a signed agent card, mutual TLS), and the catalogue entry says so.
 */
const FREE = { class: 'free', latency: 'none' } as const;

/** The peer-auth component's id (WP143). */
export const PEER_AUTH_COMPONENT_ID = 'governance/peer-auth';

/** What a message between seats carries for its digest. */
export interface PeerMessage {
	from: string;
	channel: string;
	text: string;
	tick: number;
	digest?: string;
}

/** The digest a world stamps on a message a seat sends, and the one a verifier recomputes. */
export function peerMessageDigest(message: Omit<PeerMessage, 'digest'>): string {
	return sha256Hex(
		canonicalJson({
			from: message.from,
			channel: message.channel,
			text: message.text,
			tick: message.tick
		})
	);
}

/** Every peer message an observation's data carries, in any channel that holds `messages`. */
export function peerMessagesIn(data: unknown): PeerMessage[] {
	if (typeof data !== 'object' || data === null) return [];
	const found: PeerMessage[] = [];
	for (const channel of Object.values(data as Record<string, unknown>)) {
		const messages = (channel as { messages?: unknown } | null)?.messages;
		if (!Array.isArray(messages)) continue;
		for (const message of messages)
			if (
				typeof message === 'object' &&
				message !== null &&
				typeof (message as PeerMessage).from === 'string' &&
				typeof (message as PeerMessage).text === 'string'
			)
				found.push(message as PeerMessage);
	}
	return found;
}

/** Why a message fails, or `undefined` when it verifies against the room's seats. */
export function peerMessageProblem(
	message: PeerMessage,
	seats: ReadonlySet<string>
): string | undefined {
	if (!seats.has(message.from)) return 'its sender is not a seat in the room';
	if (message.digest === undefined) return 'it carries no digest';
	if (message.digest !== peerMessageDigest(message))
		return 'its digest does not match what it says';
	return undefined;
}

/** The seats in the room, from a world state that lists its agents. */
function seatsOf(worldState: unknown): Set<string> {
	const agents = (worldState as { agents?: unknown } | null)?.agents;
	if (!Array.isArray(agents)) return new Set();
	return new Set(
		agents
			.map((agent) => (agent as { id?: unknown }).id)
			.filter((id): id is string => typeof id === 'string')
	);
}

/** The peer-auth component's config. */
export const peerAuthSchema = z.object({
	/** `stop-run` refuses the think; `annotate` lets it through and says so on the trace. */
	verdict: z.enum(['stop-run', 'annotate']).default('stop-run')
});

/** Verifies every message between seats before the bot reasons over it, at `pre-think` (WP143). */
export const peerAuthComponent: GuardrailComponent<z.input<typeof peerAuthSchema>> = {
	id: PEER_AUTH_COMPONENT_ID,
	name: 'Peer authentication',
	description:
		'Checks every message from another seat before the bot reasons over it: the sender is a seat in the room and the digest matches what it says. A message claiming a teammate’s name that no seat sent fails.',
	technique: 'inter-agent-authentication',
	points: ['pre-think'],
	verdicts: ['allow', 'stop-run', 'annotate'],
	cost: FREE,
	configSchema: peerAuthSchema,
	explain: (config) =>
		peerAuthSchema.parse(config).verdict === 'stop-run'
			? 'Stops the run before a turn that would reason over a message no seat sent or that was altered.'
			: 'Notes on the trace each message no seat sent or that was altered.',
	compile: (config, _deps, point) => {
		const { verdict } = peerAuthSchema.parse(config);
		const guardrail: Guardrail = {
			id: PEER_AUTH_COMPONENT_ID,
			name: 'Peer authentication',
			description: 'Verifies the sender and digest of every message between seats.',
			hooks: ['pre-think'],
			check: (ctx) => {
				const messages = peerMessagesIn(ctx.observation?.data);
				if (messages.length === 0) return { allow: true };
				const seats = seatsOf(ctx.worldState);
				const failed = messages
					.map((message) => ({ message, problem: peerMessageProblem(message, seats) }))
					.filter((each) => each.problem !== undefined);
				if (failed.length === 0) return { allow: true, note: `${messages.length} verified` };
				const label = failed
					.map(({ message, problem }) => `"${message.from}": ${problem}`)
					.join('; ');
				return verdict === 'annotate'
					? {
							allow: true,
							verdictKind: 'annotate',
							finding: { category: 'unauthenticated-peer', label }
						}
					: {
							allow: false,
							reason: `A message in view did not verify (${label}). The run stops before the bot reasons over it.`,
							disposition: 'stop-run'
						};
			}
		};
		return stampComponent([guardrail], PEER_AUTH_COMPONENT_ID, point);
	}
};
