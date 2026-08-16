<script lang="ts">
	import type { GuardrailHook, PolicyCard, PolicyDisposition, RunRecord } from '@craftabot/core';
	import { policyCardSchema } from '@craftabot/core';
	import PolicyCardChip from '$lib/components/shared/PolicyCardChip.svelte';
	import { installedPacks, createRegistry } from '$lib/packs.js';
	import { appStorage } from '$lib/state/app-storage.svelte.js';
	import {
		draftRuleToPolicyRule,
		newCondition,
		newRule,
		replayCard,
		type DraftRule,
		type ReplayHit
	} from '$lib/workshop/policy-studio.js';

	/**
	 * **The Policy Studio** (`17-…` §4.5, WP22 slice e), over the `PolicyCard`
	 * contract WP22 slices a–c built.
	 *
	 * Three things this screen does, matching `17-…` §4.5's own description —
	 * "a rule builder … with the same card rendered in Kit style live; a test
	 * bench: run the card against (a) stored traces … Library view":
	 *
	 * 1. **Author.** A card is a title, a description, and one or more rules —
	 *    hook → condition → disposition → reason. A rule's condition is a flat
	 *    list of the four leaf predicates, optionally negated, ANDed together —
	 *    `PredicateExpr`'s full and/or/not tree is what a *pack* can ship
	 *    (`starter/policy/no-loose-ends` uses `not` directly), but a form that
	 *    built arbitrary trees would be most of a small programming language;
	 *    "hook → condition → disposition → reason" is the shape the doc actually
	 *    asks for.
	 * 2. **Preview.** `PolicyCardChip` — the same component the Kit's Safety
	 *    Brick panel renders — shown live as the draft changes, so what a
	 *    builder sees while authoring is what they will see when they fit it.
	 * 3. **Test, part (a).** Replays the draft's rules against a stored run's
	 *    `decision` events and reports which would have fired — free, instant,
	 *    and the governance-forensics workflow in miniature (`17-…` §4.5). Part
	 *    (b), a scripted adversarial run, is WP22 slice f.
	 *
	 * Nothing here is saved yet — that is slice f, alongside the round-trip
	 * proof it exists to support.
	 */

	const HOOKS: GuardrailHook[] = ['pre-think', 'pre-act', 'post-act'];
	const DISPOSITIONS: PolicyDisposition[] = ['block-action', 'stop-run', 'require-approval'];
	const CONDITION_KINDS = [
		{ id: 'call-kind-is', label: 'the call is a…' },
		{ id: 'call-name-is', label: 'the call is named…' },
		{ id: 'argument-equals', label: 'an argument equals…' },
		{ id: 'usage-at-least', label: 'usage has reached…' }
	] as const;

	let id = $state('workshop/policy/untitled');
	let title = $state('');
	let description = $state('');
	let rules = $state<DraftRule[]>([newRule()]);

	function addRule(): void {
		rules = [...rules, newRule()];
	}
	function removeRule(index: number): void {
		rules = rules.filter((_, i) => i !== index);
	}
	function addCondition(ruleIndex: number): void {
		rules[ruleIndex]?.conditions.push(newCondition());
		rules = [...rules];
	}
	function removeCondition(ruleIndex: number, conditionIndex: number): void {
		const rule = rules[ruleIndex];
		if (!rule) return;
		rule.conditions = rule.conditions.filter((_, i) => i !== conditionIndex);
		rules = [...rules];
	}

	const draft = $derived<PolicyCard>({
		id,
		title: title.trim() === '' ? 'Untitled card' : title,
		...(description.trim() === '' ? {} : { description }),
		schemaVersion: 1,
		rules: rules.map(draftRuleToPolicyRule)
	});

	const validation = $derived(policyCardSchema.safeParse(draft));
	const draftJson = $derived(JSON.stringify(draft, null, 2));

	// --- library: every policy card an installed pack ships -----------------------------------

	const registry = createRegistry();
	const library = $derived(
		registry.listPolicyCards().map((card) => ({
			card,
			pack: installedPacks.find((pack) => (pack.policyCards ?? []).some((c) => c.id === card.id))
		}))
	);

	// --- test bench, part (a): replay against a stored run ------------------------------------

	let runs = $state<RunRecord[]>([]);
	let selectedRunId = $state<string | undefined>(undefined);
	let replaying = $state(false);
	let replayHits = $state<ReplayHit[] | undefined>(undefined);

	$effect(() => {
		void (async () => {
			const storage = await appStorage();
			runs = await storage.listRuns();
		})();
	});

	async function runReplay(): Promise<void> {
		if (!selectedRunId || !validation.success) return;
		replaying = true;
		try {
			const storage = await appStorage();
			const events = (await storage.getEvents(selectedRunId)).map((row) => row.event);
			replayHits = replayCard(validation.data, events);
		} finally {
			replaying = false;
		}
	}
</script>

<svelte:head><title>Policies — Workshop</title></svelte:head>

<main>
	<h1>Policy Studio</h1>

	<section aria-label="Author a card">
		<h2>Author</h2>
		<div class="author-grid">
			<div class="form">
				<label class="field">
					<span>Id</span>
					<input type="text" bind:value={id} data-testid="policy-id" />
				</label>
				<label class="field">
					<span>Title</span>
					<input type="text" bind:value={title} data-testid="policy-title" />
				</label>
				<label class="field">
					<span>Description</span>
					<input type="text" bind:value={description} data-testid="policy-description" />
				</label>

				{#each rules as rule, ruleIndex (ruleIndex)}
					<fieldset class="rule" data-testid="rule-{ruleIndex}">
						<legend>Rule {ruleIndex + 1}</legend>

						<div class="row">
							<label class="field">
								<span>Hook</span>
								<select bind:value={rule.hook}>
									{#each HOOKS as hook (hook)}<option value={hook}>{hook}</option>{/each}
								</select>
							</label>
							<label class="field">
								<span>Then</span>
								<select bind:value={rule.then}>
									{#each DISPOSITIONS as disposition (disposition)}
										<option value={disposition}>{disposition}</option>
									{/each}
								</select>
							</label>
							{#if rules.length > 1}
								<button type="button" class="remove" onclick={() => removeRule(ruleIndex)}
									>Remove rule</button
								>
							{/if}
						</div>

						<p class="hint">When…</p>
						{#each rule.conditions as condition, conditionIndex (conditionIndex)}
							<div class="row condition" data-testid="condition-{ruleIndex}-{conditionIndex}">
								<label class="not">
									<input type="checkbox" bind:checked={condition.negate} />
									not
								</label>
								<select bind:value={condition.kind}>
									{#each CONDITION_KINDS as ck (ck.id)}
										<option value={ck.id}>{ck.label}</option>
									{/each}
								</select>
								{#if condition.kind === 'call-kind-is'}
									<select bind:value={condition.callKind}>
										<option value="action">action</option>
										<option value="tool">tool</option>
									</select>
								{:else if condition.kind === 'call-name-is'}
									<input type="text" placeholder="e.g. open" bind:value={condition.name} />
								{:else if condition.kind === 'argument-equals'}
									<input
										type="text"
										placeholder="path, e.g. container"
										bind:value={condition.path}
									/>
									<span class="eq">=</span>
									<input type="text" placeholder="value" bind:value={condition.argValue} />
								{:else}
									<select bind:value={condition.field}>
										<option value="ticks">ticks</option>
										<option value="inputTokens">input tokens</option>
										<option value="outputTokens">output tokens</option>
									</select>
									<span class="eq">≥</span>
									<input type="number" min="0" bind:value={condition.threshold} />
								{/if}
								{#if rule.conditions.length > 1}
									<button
										type="button"
										class="remove"
										onclick={() => removeCondition(ruleIndex, conditionIndex)}>×</button
									>
								{/if}
							</div>
						{/each}
						<button type="button" class="add" onclick={() => addCondition(ruleIndex)}>+ and…</button
						>

						<label class="field">
							<span>Reason</span>
							<input type="text" bind:value={rule.reason} data-testid="rule-reason-{ruleIndex}" />
						</label>
					</fieldset>
				{/each}
				<button type="button" class="add" onclick={addRule}>+ Add rule</button>
			</div>

			<div class="preview">
				<p class="hint">Live preview — the same card face the Kit renders.</p>
				<PolicyCardChip {title} description={description || undefined} checked={true} />

				{#if !validation.success}
					<p class="error" data-testid="policy-invalid">
						Not a valid card yet: {validation.error.issues[0]?.message}
					</p>
				{/if}

				<pre class="json" data-testid="policy-json">{draftJson}</pre>
			</div>
		</div>
	</section>

	<section aria-label="Test bench: replay against a stored run">
		<h2>Test bench — would this have fired?</h2>
		{#if runs.length === 0}
			<p class="hint" data-testid="no-runs">
				No stored runs yet. Play a bot in the Kit, or open a matrix cell from the Eval Matrix, and
				it will show up here.
			</p>
		{:else}
			<div class="row">
				<label class="field">
					<span>Stored run</span>
					<select bind:value={selectedRunId} data-testid="replay-run">
						<option value={undefined}></option>
						{#each runs as run (run.id)}
							<option value={run.id}>{run.startedAt} — {run.goalCardId}</option>
						{/each}
					</select>
				</label>
				<button
					type="button"
					disabled={!selectedRunId || !validation.success || replaying}
					data-testid="run-replay"
					onclick={runReplay}
				>
					{replaying ? 'Replaying…' : 'Replay'}
				</button>
			</div>

			{#if replayHits}
				{#if replayHits.length === 0}
					<p class="hint" data-testid="replay-empty">
						This card never would have fired against that run.
					</p>
				{:else}
					<table data-testid="replay-hits">
						<thead>
							<tr>
								<th scope="col">Turn</th>
								<th scope="col">Rule</th>
								<th scope="col">Call</th>
								<th scope="col">Reason</th>
							</tr>
						</thead>
						<tbody>
							{#each replayHits as hit, hitIndex (hitIndex)}
								<tr>
									<td class="num">{hit.tick}</td>
									<td class="num">{hit.ruleIndex + 1}</td>
									<td class="mono">{hit.callKind}:{hit.callName}</td>
									<td>{hit.reason}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				{/if}
			{/if}
		{/if}
	</section>

	<section aria-label="Library">
		<h2>Library</h2>
		{#if library.length === 0}
			<p class="hint">No installed pack ships a policy card yet.</p>
		{:else}
			<div class="shelf" data-testid="policy-library">
				{#each library as entry (entry.card.id)}
					<div class="library-entry">
						<PolicyCardChip
							title={entry.card.title}
							description={entry.card.description}
							checked={true}
						/>
						<p class="provenance mono">
							{entry.card.id} · {entry.pack
								? `${entry.pack.name} v${entry.pack.version}`
								: 'unknown pack'}
						</p>
					</div>
				{/each}
			</div>
		{/if}
	</section>
</main>

<style>
	main {
		display: grid;
		gap: var(--cab-space-4);
		align-content: start;
		max-width: 1100px;
	}

	h1 {
		margin: 0;
		font-size: var(--cab-text-xl);
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	h2 {
		margin: 0 0 var(--cab-space-2);
		font-size: var(--cab-text-sm);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--cab-ink-muted);
	}

	section {
		background: var(--cab-cream);
		border: var(--cab-border-panel) solid var(--cab-ink-muted);
		border-radius: var(--cab-radius-panel);
		padding: var(--cab-space-3);
	}

	.author-grid {
		display: grid;
		grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr);
		gap: var(--cab-space-4);
		align-items: start;
	}

	.form {
		display: grid;
		gap: var(--cab-space-3);
	}

	.field {
		display: grid;
		gap: var(--cab-space-1);
		font-size: var(--cab-text-sm);
	}

	.rule {
		display: grid;
		gap: var(--cab-space-2);
		border: 1px solid var(--cab-ink-muted);
		border-radius: var(--cab-radius-part);
		padding: var(--cab-space-2);
	}

	legend {
		font-size: var(--cab-text-xs);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--cab-ink-muted);
	}

	.row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--cab-space-2);
	}

	.condition {
		font-size: var(--cab-text-sm);
	}

	.not {
		display: flex;
		align-items: center;
		gap: 2px;
		font-size: var(--cab-text-xs);
		color: var(--cab-ink-muted);
	}

	.eq {
		color: var(--cab-ink-muted);
	}

	button,
	input,
	select {
		font: inherit;
		font-size: var(--cab-text-sm);
		padding: 2px var(--cab-space-2);
		color: var(--cab-ink);
		background: var(--cab-paper);
		border: 1px solid var(--cab-ink-muted);
		border-radius: var(--cab-radius-part);
	}

	button {
		cursor: pointer;
	}

	button:disabled {
		cursor: progress;
		color: var(--cab-ink-muted);
	}

	.add,
	.remove {
		justify-self: start;
		font-size: var(--cab-text-xs);
	}

	:focus-visible {
		outline: var(--cab-focus-ring);
		outline-offset: var(--cab-focus-gap);
	}

	.preview {
		display: grid;
		gap: var(--cab-space-2);
		align-content: start;
	}

	.error {
		margin: 0;
		font-size: var(--cab-text-xs);
		color: var(--cab-red, #a33);
	}

	.json {
		margin: 0;
		max-height: 40vh;
		overflow: auto;
		padding: var(--cab-space-2);
		font-size: var(--cab-text-xs);
		background: var(--cab-paper);
		border-radius: var(--cab-radius-part);
	}

	.hint {
		margin: 0;
		max-width: 70ch;
		font-size: var(--cab-text-xs);
		color: var(--cab-ink-muted);
	}

	table {
		width: 100%;
		border-collapse: collapse;
		font-size: var(--cab-text-sm);
	}

	th,
	td {
		padding: var(--cab-space-1) var(--cab-space-2);
		text-align: left;
		border-bottom: 1px solid color-mix(in srgb, var(--cab-ink) 12%, transparent);
	}

	thead th {
		font-size: var(--cab-text-xs);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--cab-ink-muted);
	}

	.num {
		text-align: right;
		font-variant-numeric: tabular-nums;
	}

	.mono {
		font-family: var(--cab-font-mono);
		font-size: var(--cab-text-xs);
	}

	.shelf {
		display: flex;
		flex-wrap: wrap;
		gap: var(--cab-space-3);
	}

	.library-entry {
		display: grid;
		gap: var(--cab-space-1);
	}

	.provenance {
		margin: 0;
		color: var(--cab-ink-muted);
	}
</style>
