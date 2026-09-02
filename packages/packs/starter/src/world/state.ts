import type {
	GridWorldAgent,
	GridWorldCharacter,
	GridWorldContainer,
	GridWorldContainerState,
	GridWorldFurniture,
	GridWorldItem,
	GridWorldItemLocation
} from '@craftabot/core';
import type { Cell } from './grid.js';
import { sameCell, withinReach } from './grid.js';

/**
 * The Playroom's world state (02-AGENT-MODEL.md §4). Declared with `type`
 * rather than `interface` so it stays structurally assignable to core's
 * `WorldState = Record<string, unknown>`; interfaces get no implicit index
 * signature. Everything here is plain JSON — it is snapshotted into the trace.
 *
 * > **Amended 2026-08-16 (WP28):** the shapes below are now aliases of, or
 * > extensions on, core's `GridWorld*` types (`types/grid-world.ts`) — the
 * > shared floor a second grid-based world pack renders through without
 * > depending on this one. `PlayroomState` keeps its own name and its own
 * > extra fields (`spoken`, `heard`, `celebrated`); what changed is only that
 * > it is now provably a `GridWorldState`, not a `PlayroomState` `WorldView`
 * > had to know by name.
 */

export type ItemLocation = GridWorldItemLocation;

export type PlayroomItem = GridWorldItem;

export type PlayroomCharacter = GridWorldCharacter;

export type ContainerState = GridWorldContainerState;

export type PlayroomContainer = GridWorldContainer & {
	/** Item id of the key that unlocks it, when locked. */
	unlockedBy: string | null;
};

export type PlayroomFurniture = GridWorldFurniture;

export type PlayroomAgent = GridWorldAgent;

export type SpokenLine = {
	tick: number;
	text: string;
	/** Where the bot stood when it spoke — the "within 2 squares" predicate needs this. */
	position: Cell;
};

/** One message sent over Radio, in the shared log every channel is drawn from (WP31 stage F). */
export type RadioMessage = {
	/** The true sender, from the seat-swap trick — honest regardless of the message's own text. */
	from: string;
	fromName: string;
	channel: string;
	text: string;
	tick: number;
};

/** A Radio brick's own config, written once via `WorldInstance.configure` and read by both ends. */
export type RadioConfig = { channel: string; allowFrom?: string[] };

/** A manual entry a scenario injected (WP44) — searched beside the static manual. */
export interface InjectedManualEntry {
	id: string;
	keywords: string[];
	text: string;
}

export type PlayroomState = {
	/**
	 * Each seat's own read cursor into `heard` (WP48, `36-…` §4.3) — the index
	 * of the first line it has not heard yet, the same pattern `radioCursors`
	 * uses. The solo path is the seat `'solo'`.
	 */
	heardCursors?: Record<string, number>;
	/** Lines a scenario said the bot should overhear at a later tick (WP44); released into `heard` when that tick is observed. */
	scheduledHeard?: Array<{ atTick: number; text: string }>;
	/** Manual entries a scenario injected (WP44). */
	manualExtras?: InjectedManualEntry[];
	/** A connector tool's answer, overridden by a scenario (WP44), keyed by the tool's qualified id. */
	serviceOverrides?: Record<string, unknown>;
	width: number;
	height: number;
	tick: number;
	/**
	 * What the bot is carrying is stored *only* on the item (`location.kind ===
	 * 'carried'`), never mirrored here — one source of truth means "carrying two
	 * things" is unrepresentable rather than merely forbidden. The one-item-at-a-time
	 * limit (02-AGENT-MODEL.md §4) is then enforced by `carriedItem()`.
	 */
	/**
	 * `id` is the acting agent's own id, staged here for the length of one
	 * `forAgent` facade call and never read between calls (WP29, `23-…` §4.8) —
	 * every action handler still reads and writes plain `bot.position`, and
	 * none of them ever learns a second robot exists. Absent on every layout
	 * that never opts into `forAgent`, which keeps every snapshot ever written
	 * byte-identical.
	 */
	bot: { position: Cell; id?: string };
	furniture: PlayroomFurniture[];
	containers: PlayroomContainer[];
	characters: PlayroomCharacter[];
	items: PlayroomItem[];
	spoken: SpokenLine[];
	/** User messages awaiting the Hearing channel; drained when observed. */
	heard: string[];
	celebrated: boolean;
	/**
	 * Every robot's own persistent seat, when the room hosts more than one
	 * (WP29, `23-…` §4.3/§4.8). Absent for every layout that never opts in.
	 */
	agents?: PlayroomAgent[];
	/**
	 * Where a co-op layout seats its robots, in binding order — the first
	 * agent to call `forAgent` gets `coopStarts[0]`, the second `coopStarts[1]`,
	 * and so on. Pack content, not a core concept: only the layout that ships
	 * this list ever has more than one robot in the room, and a layout that
	 * omits it is simply not offering a second seat.
	 */
	coopStarts?: Cell[];
	/**
	 * Every message ever sent over Radio, in arrival order (WP31 stage F).
	 * Shared across every channel value — a bot's own `RadioConfig.channel`
	 * is what narrows this down to the board it actually listens to.
	 */
	radio?: RadioMessage[];
	/**
	 * Each agent's own read cursor into `radio` — the index of the first
	 * message it has not yet seen. Keyed by `bot.id`, falling back to
	 * `'solo'` on a layout that never opts into `forAgent` (WP31 stage F).
	 */
	radioCursors?: Record<string, number>;
	/**
	 * Each agent's own Radio brick config, set once via `configure()` before
	 * the first tick and read by both the sending and the receiving end
	 * (WP31 stage F) — `PlayroomState`'s own copy of config `AgentHandle`
	 * deliberately never carries.
	 */
	radioConfigs?: Record<string, RadioConfig>;
};

/** One field-level change, as `ActionResult.stateDiff` for the trace drawer (03-UI-UX-DESIGN.md §5.2). */
export type StateChange = {
	path: string;
	from: unknown;
	to: unknown;
};

export function findItem(state: PlayroomState, id: string): PlayroomItem | undefined {
	return state.items.find((item) => item.id === id);
}

export function findCharacter(state: PlayroomState, id: string): PlayroomCharacter | undefined {
	return state.characters.find((character) => character.id === id);
}

export function findContainer(state: PlayroomState, id: string): PlayroomContainer | undefined {
	return state.containers.find((container) => container.id === id);
}

/**
 * Resolving what the *model* called something.
 *
 * `findItem` and friends above match on id, which is right for the world's own
 * internal lookups. It is wrong for anything an LLM typed, and was a real bug:
 * the Sight channel describes a block as "a blue letter block (A)" and never
 * shows an id anywhere, while `pick_up` demanded `block-b`. A bot standing on
 * the block could not pick it up by any name it had been given, got told "there
 * is no such thing here" about an object it could see, and looped until its step
 * budget ran out. Worse, `block-a` — the obvious guess for "the A block" — is
 * the *red C* block, so a reasonable guess silently grabbed the wrong object.
 *
 * The fix is to accept the vocabulary the world itself taught: an entity answers
 * to its id or to its name, compared loosely enough to survive articles, case,
 * punctuation, and the parenthetical letter.
 *
 * Ambiguity is deliberately *not* resolved by picking a winner. "block" matches
 * all three, and quietly choosing one would recreate the silent-wrong-object
 * failure this exists to remove; the caller reports the ambiguity instead.
 */

const ARTICLES = new Set(['a', 'an', 'the']);

/**
 * The words worth matching on, lower-cased, punctuation dropped.
 *
 * Articles go, with two exceptions, both of them letters painted on blocks.
 *
 * **An article never ends a phrase.** The trailing word in "block a" is a
 * label, and so is the `a` in the id `block-a`. Stripping it made all three
 * blocks answer to the bare word "block" through their ids, so a bot that
 * said "block" was handed the blue one without being told there were three —
 * the silent-wrong-object failure this whole module exists to prevent
 * (`12-…` C4).
 *
 * **A capital `A` is a letter.** It is how the world writes the label — "a
 * blue letter block (A)" — and how a model refers to it: "the A block".
 *
 * "a block", where a lower-case article leads, keeps losing it and stays
 * ambiguous. That is the honest answer: the phrase describes three things.
 */
function tokensOf(text: string): string[] {
	const words = text.split(/[^A-Za-z0-9]+/).filter((word) => word !== '');
	return words
		.filter(
			(word, index) =>
				index === words.length - 1 || word === 'A' || !ARTICLES.has(word.toLowerCase())
		)
		.map((word) => word.toLowerCase());
}

/** The token list as one comparable string. */
function phraseOf(tokens: string[]): string {
	return tokens.join(' ');
}

/** Every word the query used appears somewhere in the candidate's vocabulary. */
function describedBy(queryTokens: string[], candidate: Named): boolean {
	if (queryTokens.length === 0) return false;
	const vocabulary = new Set([...tokensOf(candidate.name), ...tokensOf(candidate.id)]);
	return queryTokens.every((token) => vocabulary.has(token));
}

export type Resolution<T> =
	{ kind: 'found'; entity: T } | { kind: 'none' } | { kind: 'ambiguous'; matches: T[] };

type Named = { id: string; name: string };

export function resolveNamed<T extends Named>(
	candidates: readonly T[],
	query: string
): Resolution<T> {
	const exactId = candidates.find((candidate) => candidate.id === query);
	if (exactId) return { kind: 'found', entity: exactId };

	const queryTokens = tokensOf(query);
	// Nothing but punctuation: there is no question to answer.
	if (queryTokens.length === 0) return { kind: 'none' };
	const wanted = phraseOf(queryTokens);

	// The whole phrase, as the world writes it — "block a" reaches block-a by
	// its id, "a blue letter block (A)" by its name.
	const exact = candidates.filter(
		(candidate) =>
			phraseOf(tokensOf(candidate.id)) === wanted || phraseOf(tokensOf(candidate.name)) === wanted
	);
	if (exact.length === 1) return { kind: 'found', entity: exact[0] as T };
	if (exact.length > 1) return { kind: 'ambiguous', matches: exact };

	// Then containment either way, so both "blue letter block" and the fuller
	// "a stripy ball on the rug" land on the thing they describe.
	const partial = candidates.filter((candidate) => {
		const name = phraseOf(tokensOf(candidate.name));
		return name.includes(wanted) || wanted.includes(name);
	});
	if (partial.length === 1) return { kind: 'found', entity: partial[0] as T };
	if (partial.length > 1) return { kind: 'ambiguous', matches: partial };

	// Finally the words in any order: "blue block", "the A block", "chunky key",
	// "the biscuit in the bowl". Ambiguity is still not resolved by picking a
	// winner — "red" describes both the red key and the red block, and saying so
	// costs one turn where a silent wrong guess costs a whole run.
	const described = candidates.filter((candidate) => describedBy(queryTokens, candidate));
	if (described.length === 1) return { kind: 'found', entity: described[0] as T };
	if (described.length > 1) return { kind: 'ambiguous', matches: described };

	return { kind: 'none' };
}

export const resolveItem = (state: PlayroomState, query: string) =>
	resolveNamed(state.items, query);
export const resolveCharacter = (state: PlayroomState, query: string) =>
	resolveNamed(state.characters, query);
export const resolveContainer = (state: PlayroomState, query: string) =>
	resolveNamed(state.containers, query);

/** What the bot could actually pick up from where it stands — a recoverable hint. */
export function reachableItemNames(state: PlayroomState): string[] {
	return state.items
		.filter((item) => {
			if (item.location.kind === 'floor')
				return withinReach(state.bot.position, item.location.position);
			if (item.location.kind === 'in-container') {
				const container = findContainer(state, item.location.containerId);
				return (
					container !== undefined &&
					container.state === 'open' &&
					withinReach(state.bot.position, container.position)
				);
			}
			return false;
		})
		.map((item) => item.name);
}

/**
 * Furniture, containers, characters, and fellow robots all take up a cell the
 * acting agent cannot enter — and, for a fellow robot, cannot even describe
 * itself as standing on (WP29, `23-…` §4.8).
 *
 * The exclusion is by position, not by id: `state.bot.position` is always the
 * *acting* agent's own current seat for the length of one facade call, and
 * under the collision rule this method itself enforces, nobody else can ever
 * coincide with it — so "not at my own current cell" is exactly "not me",
 * with no separate identity check needed. This is a no-op for a move's target
 * cell (which is never the mover's own cell) and only matters when sight asks
 * about the cell the agent is already standing on.
 */
export function blockerAt(
	state: PlayroomState,
	cell: Cell
): { id: string; name: string } | undefined {
	return (
		state.furniture.find((piece) => sameCell(piece.position, cell)) ??
		state.containers.find((container) => sameCell(container.position, cell)) ??
		state.characters.find((character) => sameCell(character.position, cell)) ??
		state.agents?.find(
			(agent) => sameCell(agent.position, cell) && !sameCell(agent.position, state.bot.position)
		)
	);
}

export function itemsOnFloorAt(state: PlayroomState, cell: Cell): PlayroomItem[] {
	return state.items.filter(
		(item) => item.location.kind === 'floor' && sameCell(item.location.position, cell)
	);
}

export function itemsInContainer(state: PlayroomState, containerId: string): PlayroomItem[] {
	return state.items.filter(
		(item) => item.location.kind === 'in-container' && item.location.containerId === containerId
	);
}

export function itemsHeldBy(state: PlayroomState, characterId: string): PlayroomItem[] {
	return state.items.filter(
		(item) => item.location.kind === 'held-by' && item.location.characterId === characterId
	);
}

/** Where an item physically sits, for reach checks — undefined when carried by the bot. */
export function itemCell(state: PlayroomState, item: PlayroomItem): Cell | undefined {
	switch (item.location.kind) {
		case 'floor':
			return item.location.position;
		case 'in-container':
			return findContainer(state, item.location.containerId)?.position;
		case 'held-by':
			return findCharacter(state, item.location.characterId)?.position;
		case 'carried':
			return state.bot.position;
	}
}
