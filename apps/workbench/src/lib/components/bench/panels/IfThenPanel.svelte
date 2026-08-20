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
	 * Targets are stored by their **wire name** (`pick_up`, not
	 * `starter/playroom/pick_up`) — the same bare form a brain-driven call
	 * uses, and the only form `world.perform` actually dispatches on
	 * (`agent-session.ts`'s own `wireName`, used identically for a reflex's
	 * proposed call and a brain's decided one). Found live in the browser,
	 * stage C: a rule built from `worldActions`/`tools`' own qualified `id`
	 * fired correctly — `decision.source: 'reflex'` was real — and then the
	 * world refused it outright ("You do not know how to…"), because nothing
	 * downstream of a reflex re-qualifies a name the way it never has to for
	 * the brain, which never sees anything but the wire form to begin with.
	 *
	 * `then.arguments` stays unexposed for every target except `pick_up`'s own
	 * `item` (added in WP30's If/Then sizing, stage C): the reflex leaflet
	 * chapter needs to say the literal thing a rule reacts to ("if it sees
	 * yellow, pick up the yellow block") through the real Kit, and a lesson
	 * that told the reader to push JSON at a hidden field would break the
	 * leaflet's own rule that every fix happens in the UI it points at. Every
	 * other multi-argument target (`give`, `put_down`'s container) still needs
	 * a config pushed directly, exactly as before — `if-then.test.ts` does
	 * that throughout.
	 */
	interface Rule {
		ifSees: string;
		then: { kind: 'tool' | 'action'; name: string; arguments?: Record<string, unknown> };
	}

	let { config, worldActions, tools, onupdate }: BrickPanelProps = $props();

	const rules = $derived(((config.rules as Rule[] | undefined) ?? []).slice());

	/** The last segment of a content id — the form `world.perform` actually dispatches on. */
	function wireName(contentId: string): string {
		const lastSlash = contentId.lastIndexOf('/');
		return lastSlash === -1 ? contentId : contentId.slice(lastSlash + 1);
	}

	const targets = $derived([
		...worldActions.map((action) => ({
			value: `action:${wireName(action.id)}`,
			label: `${action.name} (action)`
		})),
		...tools.map((tool) => ({ value: `tool:${wireName(tool.id)}`, label: `${tool.name} (tool)` }))
	]);

	/** Normalised through `wireName` so a rule stored qualified (pushed as config, not built here) still shows selected. */
	function targetValueOf(rule: Rule): string {
		return `${rule.then.kind}:${wireName(rule.then.name)}`;
	}

	/** Whether a target is `pick_up`, qualified or not — the one action whose argument this panel edits. */
	function isPickUp(rule: Rule): boolean {
		return (
			rule.then.kind === 'action' &&
			(rule.then.name === 'pick_up' || rule.then.name.endsWith('/pick_up'))
		);
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

	function setItem(index: number, rule: Rule, item: string): void {
		replaceRule(index, {
			...rule,
			then: { ...rule.then, arguments: { ...rule.then.arguments, item } }
		});
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
			{#if isPickUp(rule)}
				<label class="field">
					<span>The item</span>
					<input
						type="text"
						placeholder="the yellow block"
						value={(rule.then.arguments?.item as string | undefined) ?? ''}
						oninput={(event) => setItem(index, rule, event.currentTarget.value)}
					/>
				</label>
			{/if}
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
