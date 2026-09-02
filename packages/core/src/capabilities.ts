import type { PackRegistry } from './pack-registry.js';
import { toSpecV2, type AnyAgentSpec } from './schemas/agent-spec-v2.js';
import { brainSlotSchema, memorySlotSchema, slotConfig } from './schemas/slot-contracts.js';
import {
	buildRuntimes,
	collectCalls,
	collectGuardrails,
	collectSenses,
	disposeRuntimes
} from './session/brick-runtimes.js';
import type { SlotId } from './types/brick.js';

/**
 * **What a bot can do, rather than what it is made of** (WP14 slice 4c).
 *
 * The tutorial layer — the Instruction Leaflet and the keyless demo brain —
 * used to read a bot through V1's six-key window: `spec.bricks.actions?.enabled`,
 * `spec.bricks.sense?.channels`, `spec.bricks.memory !== undefined`. They were
 * the last two places in the app that did, and the reason they held out longest
 * is that they ask a genuinely different question from everything else. The
 * bench asks *what is fitted*; the leaflet asks *can this bot see yet?*
 *
 * That turns out to be the better question, and the brick contract already
 * answers it. A bot can see because *something* opened a sense channel; it can
 * act because something offered an action; it asks permission because something
 * installed a rule that pauses. None of those sentences names a brick, and none
 * of them needs to — which means a lesson written against them keeps working
 * when the brick teaching it comes from a pack that did not exist when the
 * lesson was written.
 *
 * Everything here is read through core's own machinery: the same
 * `buildRuntimes` the session uses, the same slot contracts, the same
 * collectors. The tutorial sees exactly what the engine sees.
 */

export interface BotCapabilities {
	/** Which sockets have something in them. */
	readonly filled: ReadonlySet<SlotId>;
	/** Tools the fitted bricks put on the belt. */
	readonly toolIds: readonly string[];
	/** World actions the fitted bricks give the bot a way to perform. */
	readonly actionIds: readonly string[];
	/** Sense channels the fitted bricks open. */
	readonly channels: readonly string[];
	/** The model cartridge, through the brain slot contract. Empty when there is none. */
	readonly cartridgeId: string;
	/** Whether the bot has a notebook to write in. */
	readonly notebook: boolean;
	/** The ids of every rule the fitted bricks install. */
	readonly guardrailIds: readonly string[];
	/**
	 * Everything above as one comparable value, so "did the build change?" is a
	 * string comparison.
	 *
	 * Deliberately a fingerprint of *capabilities* rather than of the spec. The
	 * leaflet asks this to decide whether the evidence from the last run is still
	 * good, and it is: nudging the temperature dial changes the spec and changes
	 * nothing the tutorial can observe.
	 */
	readonly fingerprint: string;
}

function fingerprintOf(can: Omit<BotCapabilities, 'fingerprint'>): string {
	return JSON.stringify([
		[...can.filled].sort(),
		[...can.toolIds].sort(),
		[...can.actionIds].sort(),
		[...can.channels].sort(),
		can.cartridgeId,
		can.notebook,
		[...can.guardrailIds].sort()
	]);
}

function sealed(can: Omit<BotCapabilities, 'fingerprint'>): BotCapabilities {
	return { ...can, fingerprint: fingerprintOf(can) };
}

const EMPTY: BotCapabilities = sealed({
	filled: new Set(),
	toolIds: [],
	actionIds: [],
	channels: [],
	cartridgeId: '',
	notebook: false,
	guardrailIds: []
});

/**
 * Ask a bot what it can do.
 *
 * Builds the fitted bricks' runtimes and puts them away again — the same call
 * the session makes, with randomness fixed because nothing built here is ever
 * run. A brick that decided what it offered by dice roll would otherwise give a
 * different answer every time the leaflet checked.
 */
export function capabilitiesOf(
	spec: AnyAgentSpec | undefined,
	registry: PackRegistry
): BotCapabilities {
	if (!spec) return EMPTY;

	const v2 = toSpecV2(spec);
	const runtimes = buildRuntimes({
		spec: v2,
		registry,
		context: {
			random: () => 0,
			getPolicyCard: (id) => registry.getPolicyCard(id),
			getAction: (id) => registry.getAction(id),
			fetch: () => Promise.reject(new Error('fetch is not available while reading capabilities')),
			getCredential: () => undefined
		}
	});
	try {
		const calls = collectCalls(runtimes);
		return sealed({
			filled: new Set(v2.bricks.map((brick) => brick.slot)),
			toolIds: calls.toolIds,
			actionIds: calls.actionIds,
			channels: collectSenses(runtimes),
			cartridgeId: slotConfig(v2, registry, 'brain', brainSlotSchema)?.cartridgeId ?? '',
			notebook: slotConfig(v2, registry, 'memory', memorySlotSchema)?.notebook ?? false,
			guardrailIds: collectGuardrails(runtimes).map((guardrail) => guardrail.id)
		});
	} finally {
		disposeRuntimes(runtimes);
	}
}

/**
 * Whether a capability list names a piece of content, qualified or not.
 *
 * A channel is `starter/playroom/sight` in a spec and `sight` to the world it
 * belongs to (E6), and a lesson should not have to care which it is looking at.
 */
export function offers(ids: readonly string[], id: string): boolean {
	return ids.some((candidate) => candidate === id || candidate.endsWith(`/${id}`));
}
