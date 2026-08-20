<script lang="ts">
	import type { BrickPanelProps } from './panel-props.js';

	/**
	 * The If/Then brick's panel (If/Then sizing, stage B).
	 *
	 * A hand-written override, not a schema-driven one, for a reason none of
	 * the six V1 overrides had: `rules: z.array(z.object({...}))` is an array
	 * of *structured* objects, and `SchemaPanel`'s own array control is built
	 * for arrays of strings ("separate with commas") — tried first, and found
	 * live in the browser to render exactly that for this field, which cannot
	 * express a rule at all. `then`'s target is a `<select>` over this bot's
	 * own installed actions and tools (`worldActions`/`tools`, already handed
	 * to every panel) rather than a typed name, so a rule can only ever name
	 * something that is actually real.
	 *
	 * `then.arguments` is deliberately not exposed here yet: a rule can name
	 * any zero-argument action or tool (`celebrate`, `win`, `ping`) fully, and
	 * one that takes arguments (`pick_up`, `give`) can still be built by
	 * pushing a brick config directly (every test in `if-then.test.ts` does
	 * exactly that) — only the Kit's own control for it is the gap, recorded
	 * here rather than silently left unmentioned.
	 */
	interface Rule {
		ifSees: string;
		then: { kind: 'tool' | 'action'; name: string; arguments?: Record<string, unknown> };
	}

	let { config, worldActions, tools, onupdate }: BrickPanelProps = $props();

	const rules = $derived(((config.rules as Rule[] | undefined) ?? []).slice());

	const targets = $derived([
		...worldActions.map((action) => ({
			value: `action:${action.id}`,
			label: `${action.name} (action)`
		})),
		...tools.map((tool) => ({ value: `tool:${tool.id}`, label: `${tool.name} (tool)` }))
	]);

	function targetValueOf(rule: Rule): string {
		return `${rule.then.kind}:${rule.then.name}`;
	}

	/** `kind:id` — safe to split on the first colon, since no id ever contains one. */
	function parseTarget(value: string): { kind: 'tool' | 'action'; name: string } {
		const separator = value.indexOf(':');
		return {
			kind: value.slice(0, separator) as 'tool' | 'action',
			name: value.slice(separator + 1)
		};
	}

	function replaceRule(index: number, next: Rule): void {
		onupdate({ rules: rules.map((rule, i) => (i === index ? next : rule)) });
	}

	function removeRule(index: number): void {
		onupdate({ rules: rules.filter((_, i) => i !== index) });
	}

	function addRule(): void {
		const first = targets[0];
		const then = first ? parseTarget(first.value) : { kind: 'action' as const, name: '' };
		onupdate({ rules: [...rules, { ifSees: '', then: { ...then, arguments: {} } }] });
	}
</script>

<div class="rules">
	{#if rules.length === 0}
		<p class="whisper">No rules yet — add one below.</p>
	{/if}
	{#each rules as rule, index (index)}
		<div class="rule" data-testid="if-then-rule-{index}">
			<label class="field">
				<span>If it sees</span>
				<input
					type="text"
					placeholder="a word to look for"
					value={rule.ifSees}
					oninput={(event) => replaceRule(index, { ...rule, ifSees: event.currentTarget.value })}
				/>
			</label>
			<label class="field">
				<span>Then</span>
				<select
					value={targetValueOf(rule)}
					onchange={(event) =>
						replaceRule(index, {
							...rule,
							then: {
								...parseTarget(event.currentTarget.value),
								arguments: rule.then.arguments ?? {}
							}
						})}
				>
					{#if targets.length === 0}
						<option value="">— nothing installed yet —</option>
					{/if}
					{#each targets as target (target.value)}
						<option value={target.value}>{target.label}</option>
					{/each}
				</select>
			</label>
			<button type="button" onclick={() => removeRule(index)}>Remove this rule</button>
		</div>
	{/each}
	<button type="button" onclick={addRule} disabled={targets.length === 0}>Add a rule</button>
	{#if targets.length === 0}
		<p class="whisper">
			Fit a Hands &amp; Wheels or Tool Belt brick first, so a rule has something to do.
		</p>
	{/if}
</div>

<style>
	.rules {
		display: grid;
		gap: var(--cab-space-3);
	}

	.rule {
		display: grid;
		gap: var(--cab-space-2);
		padding: var(--cab-space-2);
		border: var(--cab-border-part) solid var(--cab-ink);
		border-radius: var(--cab-radius-panel);
	}

	.whisper {
		margin: 0;
		font-size: var(--cab-text-sm);
		opacity: 0.75;
	}
</style>
