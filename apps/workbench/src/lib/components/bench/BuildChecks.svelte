<script lang="ts">
	import type { BuildProblem } from '@craftabot/core';

	/**
	 * The build-checks ribbon (03-UI-UX-DESIGN.md §4.2). Friendly validation from
	 * `validateSpec`, with a jump-to-fix on click.
	 *
	 * The tone matters as much as the content: only a blocking problem stops GO,
	 * and warnings *explain, never block* (§4.4). A ribbon that scolded on every
	 * half-built bot would punish exactly the experimenting the whole toy exists
	 * to encourage.
	 */
	interface Props {
		problems: BuildProblem[];
		onjump?: (problem: BuildProblem) => void;
	}

	let { problems, onjump }: Props = $props();

	const blocking = $derived(problems.filter((problem) => problem.severity === 'blocking'));
	const warnings = $derived(problems.filter((problem) => problem.severity === 'warning'));
</script>

<div class="ribbon" data-testid="build-checks">
	{#if problems.length === 0}
		<p class="all-clear" data-testid="checks-all-clear">
			<span class="chip chip--ok" aria-hidden="true">✓</span>
			Everything checks out — your bot is ready to go.
		</p>
	{:else}
		<ul>
			{#each [...blocking, ...warnings] as problem (problem.code + (problem.brick ?? ''))}
				<li data-testid="check-{problem.code}" data-severity={problem.severity}>
					<span class="chip chip--{problem.severity}" aria-hidden="true">
						{problem.severity === 'blocking' ? '!' : '?'}
					</span>
					{#if onjump && problem.brick}
						<button type="button" onclick={() => onjump(problem)}>{problem.message}</button>
					{:else}
						<span>{problem.message}</span>
					{/if}
					<span class="severity">{problem.severity === 'blocking' ? 'Needed' : 'Worth a look'}</span
					>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.ribbon {
		background: var(--cab-cream);
		border: var(--cab-border-part) solid color-mix(in srgb, var(--cab-ink) 25%, transparent);
		border-radius: var(--cab-radius-panel);
		padding: var(--cab-space-2) var(--cab-space-3);
		font-size: var(--cab-text-sm);
	}

	ul {
		margin: 0;
		padding: 0;
		list-style: none;
		display: grid;
		gap: var(--cab-space-1);
	}

	li {
		display: flex;
		align-items: center;
		gap: var(--cab-space-2);
	}

	.all-clear {
		margin: 0;
		display: flex;
		align-items: center;
		gap: var(--cab-space-2);
	}

	/* Severity is doubled by the chip glyph and the word, never colour alone (03 §8). */
	.chip {
		flex: none;
		display: grid;
		place-items: center;
		width: 20px;
		height: 20px;
		border-radius: 50%;
		font-weight: 800;
		font-size: var(--cab-text-xs);
		color: var(--cab-ink);
	}

	.chip--ok {
		background: var(--cab-green-fill);
		color: var(--cab-cream);
	}
	.chip--blocking {
		background: var(--cab-red-fill);
		color: var(--cab-cream);
	}
	.chip--warning {
		background: var(--cab-yellow);
	}

	button {
		background: none;
		border: none;
		padding: 0;
		font: inherit;
		color: var(--cab-blue-text);
		text-align: left;
		text-decoration: underline;
		cursor: pointer;
	}

	button:focus-visible {
		outline: var(--cab-focus-ring);
		outline-offset: var(--cab-focus-gap);
	}

	.severity {
		margin-left: auto;
		font-size: var(--cab-text-xs);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		opacity: 0.7;
		white-space: nowrap;
	}
</style>
