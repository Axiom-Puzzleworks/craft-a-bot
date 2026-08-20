import type { Component } from 'svelte';
import ActionsPanel from './ActionsPanel.svelte';
import IfThenPanel from './IfThenPanel.svelte';
import LlmPanel from './LlmPanel.svelte';
import MemoryPanel from './MemoryPanel.svelte';
import SafetyPanel from './SafetyPanel.svelte';
import SensePanel from './SensePanel.svelte';
import ToolsPanel from './ToolsPanel.svelte';
import type { BrickPanelProps } from './panel-props.js';

/**
 * **Hand-written panels, by kind id** (WP14 slice 4a, `14-…` §2.1).
 *
 * The distinction this table turns on, and the reason it is not `12-…` D11
 * wearing a hat: an entry here is a **preference, not a precondition**. Before
 * this slice a brick could not have a panel at all unless `BrickPanel` carried
 * an `if` for it, so the six were the only six there could ever be. Now a kind
 * with no entry renders from its schema and works, and an entry only buys a
 * nicer control than the schema could have inferred.
 *
 * That is the whole test for an extension point: things not in the table still
 * work. `SchemaPanel` is what makes it true, and the fallback test in
 * `BrickPanel.svelte.test.ts` is what keeps it true.
 *
 * Why the original six are worth an override is written on each of them; two
 * of them — the tool belt's notebook warning and the safety brick's
 * conditional repeat limit — do things `ControlHints` deliberately cannot
 * express, and the rest are here because slice 4a moves the panels without
 * redesigning them. The If/Then brick (If/Then sizing, stage B) joined for a
 * third reason none of the six had: its `rules` field is an array of
 * *structured objects*, which the schema-driven fallback cannot infer a
 * sensible control for at all — tried first, and found live in the browser to
 * offer a comma-separated text box that cannot express a rule.
 *
 * Overrides live in the workbench and not in packs because packs never import
 * Svelte (hard rule 1). A pack's route to good controls is `controlHints`.
 */
export const PANEL_OVERRIDES: Record<string, Component<BrickPanelProps>> = {
	'starter/llm': LlmPanel as Component<BrickPanelProps>,
	'starter/memory': MemoryPanel as Component<BrickPanelProps>,
	'starter/tools': ToolsPanel as Component<BrickPanelProps>,
	'starter/sense': SensePanel as Component<BrickPanelProps>,
	'starter/actions': ActionsPanel as Component<BrickPanelProps>,
	'starter/safety': SafetyPanel as Component<BrickPanelProps>,
	'starter/if-then': IfThenPanel as Component<BrickPanelProps>
};

export function panelOverrideFor(kindId: string): Component<BrickPanelProps> | undefined {
	return PANEL_OVERRIDES[kindId];
}
