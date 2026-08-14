import { z } from 'zod';
import type { PackRegistry } from '../pack-registry.js';
import { toSpecV2, type AnyAgentSpec } from './agent-spec-v2.js';
import type { SlotId } from '../types/brick.js';

/**
 * **What core may assume about a socket** (WP14 slice 3c).
 *
 * Most of what a brick does reaches the loop as a *contribution*: the prompt
 * sections it adds, the calls it offers, the channels it opens. Two things do
 * not, because they are not contributions at all — they configure machinery
 * core owns:
 *
 *  - the **brain** socket says which model to call, how hot, and how long;
 *  - the **memory** socket says how much to remember and whether to keep a
 *    notebook.
 *
 * There is no honest hook shape for those. A `contributeMemory()` that returned
 * `{ windowSize, notebook }` would be a hook laundering config through a
 * runtime, and a Brain brick "contributing" a temperature is not contributing
 * anything — the engine is going to read it and make the call either way.
 *
 * So core states a **slot contract** instead: whatever is fitted to this
 * socket must have at least these fields, and core reads them. That is a
 * different thing from the taxonomy this whole workstream is dismantling
 * (`12-…` D11): core knows what the *brain socket* means, which `14-…` §2.3
 * says it owns, and not what `starter/llm` is. Any pack's brain works, so long
 * as it has a cartridge.
 *
 * **The limit, stated plainly.** A brick whose config is shaped differently
 * cannot fill these two sockets — a "Vector Memory" brick with `embeddings` and
 * no `windowSize` would be fitted, validated, and then ignored by the memory
 * the loop actually keeps. When such a brick is wanted, the answer is to let
 * the Memory brick contribute its own prompt messages (a placement widening of
 * `ContextContribution`, noted in `types/brick.ts`) rather than to widen this.
 * Recorded here so that is a decision someone makes, not a wall they hit.
 */

/** What core reads from whatever is in the brain socket. */
export const brainSlotSchema = z.object({
	cartridgeId: z.string(),
	temperature: z.number(),
	maxTokens: z.number().int().positive()
});
export type BrainSlotConfig = z.infer<typeof brainSlotSchema>;

/**
 * What core reads from whatever is in the memory socket.
 *
 * `windowSize` is any positive integer here, where the starter brick's own
 * schema allows 3, 10 or 30. The contract is what core needs to keep a window;
 * which sizes a *particular* brick offers is that brick's business, and
 * `validateSpec` still holds it to its own schema.
 */
export const memorySlotSchema = z.object({
	windowSize: z.number().int().positive(),
	notebook: z.boolean(),
	/**
	 * Which strategy pairing the loop should assemble context with (E7).
	 *
	 * Core reads it for the same reason it reads `windowSize`: this configures
	 * machinery core owns — the memory it keeps and the prompt it composes — and
	 * there is no honest hook through which a brick could contribute either.
	 * Optional, and absent means `window`, so a brick that has never heard of
	 * strategies still fills the socket.
	 */
	strategy: z.enum(['window', 'transcript']).optional()
});
export type MemorySlotConfig = z.infer<typeof memorySlotSchema>;

/**
 * What core reads from whatever is in the safety socket: **the dial, and only
 * the dial** (WP14 slice 3d).
 *
 * Worth being precise about why this is one field rather than four. The Safety
 * Brick's blocklist, repeat limit and approval mode are *policy*, and policy has
 * an honest hook — `contributeGuardrails`, which the brick now uses. They are
 * not here because they do not need to be: core never reads them, it runs
 * whatever rules it is handed.
 *
 * `maxTicks` is different in kind. It is not a rule; it is how long the engine
 * may run, which the engine has to know before it starts and which the gauge on
 * the play screen counts down. Two things core owns need the number
 * (`resolveBudgets`'s backstop, and `displayedTickBudget`), and neither is
 * something a brick can do on its own behalf — which is exactly the test this
 * file applies to the brain and memory sockets.
 *
 * A brick in this socket with no dial — a Monitor brick, say — simply has none:
 * the backstop falls to `DEFAULT_TICK_BUDGET` and the gauge shows it, which is
 * the right answer for a bot nobody set a limit on.
 */
export const safetySlotSchema = z.object({
	maxTicks: z.number().int().positive()
});
export type SafetySlotConfig = z.infer<typeof safetySlotSchema>;

/**
 * The config of the brick in a socket, read through core's contract for it.
 *
 * `undefined` when the socket is empty, when the kind is not installed, or when
 * what is fitted does not answer the contract — all three being states
 * `validateSpec` has already reported, and all three meaning the same thing to
 * the loop: there is nothing here to configure me with.
 */
export function slotConfig<T>(
	spec: AnyAgentSpec,
	registry: PackRegistry,
	slot: SlotId,
	contract: z.ZodType<T>
): T | undefined {
	const brick = toSpecV2(spec).bricks.find((fitted) => fitted.slot === slot);
	if (!brick) return undefined;

	const kind = registry.getBrickKind(brick.kind);
	if (!kind || kind.slot !== slot) return undefined;

	const parsed = contract.safeParse(brick.config);
	return parsed.success ? parsed.data : undefined;
}
