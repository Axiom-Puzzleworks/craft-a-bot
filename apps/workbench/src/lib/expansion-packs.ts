/**
 * **The kit line, as the Shelf actually shows it** (`18-…` §4, WP33's own
 * kit-line-packaging half).
 *
 * The seven packs and the curated bundle here are `18-…` §4's own
 * merchandising table, verbatim — this module does not invent content, it
 * gives that table's row a place to render. "Unlocked!" is the only status
 * a local-first, no-backend app can honestly claim (`00-…` §3.5: no
 * accounts, no purchase gate, nothing to actually lock) — **except** where
 * the pack's own content genuinely does not exist yet. Tool Shop is that
 * exception: `18-…` §4 always scoped it "E+ (content-only)", unscheduled,
 * and unlike the other six it never got a WP — no measuring tape, camera or
 * walkie-talkie tool exists anywhere in the packs. Claiming it "Unlocked!"
 * would be the one thing this shelf must never do (the same discipline the
 * Bench Dashboard's own missing spend tile and the Workshop rail's own
 * pending screens already hold to): a `status` field, not a second kind of
 * sticker invented for the occasion.
 */

export type PackStatus = 'unlocked' | 'coming-soon';

export interface ExpansionPack {
	id: string;
	name: string;
	contents: string;
	teaches: string;
	status: PackStatus;
}

export const EXPANSION_PACKS: readonly ExpansionPack[] = [
	{
		id: 'llm-multipack',
		name: 'LLM Multi-Pack',
		contents: '6 special-skill cartridges, 4 model brands — all in your Brain Brick!',
		teaches: 'model choice; behaviour = model × config',
		status: 'unlocked'
	},
	{
		id: 'safety-patrol',
		name: 'Safety Patrol Pack',
		contents: 'Policy card deck, Monitor brick, incident stickers, scenario cards',
		teaches: 'governance as play; loop/injection/oversight',
		status: 'unlocked'
	},
	{
		id: 'planner',
		name: 'Planner Pack',
		contents: 'Planner brick, If/Then brick, plan-paper accessories, harder par cards',
		teaches: 'deliberation, rules vs reasoning',
		status: 'unlocked'
	},
	{
		id: 'robot-friends',
		name: 'Robot Friends Pack',
		contents: 'Radio brick, second chassis, co-op + spoofed-message cards',
		teaches: 'multi-agent co-op, comms trust',
		status: 'unlocked'
	},
	{
		id: 'explorers-world',
		name: "Explorer's World Pack",
		contents: 'The Workshop room world, new senses, irreversible paint action, risk-tier cards',
		teaches: 'environments, consequence, permissions',
		status: 'unlocked'
	},
	{
		id: 'library',
		name: 'Library Pack',
		contents: 'Librarian brick, book sets, retrieval cards',
		teaches: 'looking things up, grounding, citation',
		status: 'unlocked'
	},
	{
		id: 'tool-shop',
		name: 'Tool Shop Pack',
		contents: 'Extra tools (measuring tape, camera, walkie-talkie link to Radio)',
		teaches: 'tool contracts, choosing tools',
		status: 'coming-soon'
	}
] as const;

export interface AgentBuilderBundle {
	name: string;
	contents: string;
	teaches: string;
}

/**
 * The curated 5–11 kit — every pack above, plus the two things that were
 * never their own pack because the whole app already carries them: the
 * Instruction Leaflet, and the Merit Badges it awards.
 */
export const AGENT_BUILDER_BUNDLE: AgentBuilderBundle = {
	name: 'Agent Builder — the 5–11 kit',
	contents: 'Every pack above, the Instruction Leaflet, and the full badge album',
	teaches: 'the full arc: plan · reason · use tools · test · improve'
};
