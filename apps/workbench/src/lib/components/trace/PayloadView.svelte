<script lang="ts">
	import type { EngineEvent } from '@craftabot/core';

	/**
	 * The detail pane for the selected trace row.
	 *
	 * `prompt.composed` gets special treatment because it is the single most
	 * important thing the Flight Recorder shows: **the exact messages sent**,
	 * with their sections labelled, and the token estimate (03-UI-UX-DESIGN.md
	 * §5.2). Everything else falls back to pretty-printed JSON, which is a
	 * teaching surface in its own right — nothing here is opaque (07 §1.3).
	 */
	interface Props {
		event: EngineEvent | undefined;
	}

	let { event }: Props = $props();

	/** system → memory → observation, matching how the prompt is composed (02 §8). */
	function sectionName(index: number, total: number): string {
		if (index === 0) return 'system';
		return index === total - 1 ? 'observation' : 'memory';
	}
</script>

{#if !event}
	<p class="empty" data-testid="payload-empty">Pick a row to see exactly what happened.</p>
{:else if event.type === 'prompt.composed'}
	<div class="prompt" data-testid="payload-prompt">
		<p class="tokens">
			About {event.payload.estimatedTokens} tokens — this is the whole prompt, verbatim.
		</p>
		{#each event.payload.messages as message, index (index)}
			<section class="message">
				<h4>
					<span class="role">{message.role}</span>
					<span class="section">{sectionName(index, event.payload.messages.length)}</span>
				</h4>
				<pre>{message.content}</pre>
			</section>
		{/each}
	</div>
{:else}
	<pre class="json" data-testid="payload-json">{JSON.stringify(event.payload, null, 2)}</pre>
{/if}

<style>
	.empty {
		margin: 0;
		padding: var(--cab-space-3);
		font-size: var(--cab-text-sm);
		opacity: 0.7;
	}

	.prompt {
		display: grid;
		gap: var(--cab-space-2);
		padding: var(--cab-space-3);
	}

	.tokens {
		margin: 0;
		font-size: var(--cab-text-xs);
		opacity: 0.75;
	}

	.message {
		border: var(--cab-border-part) solid color-mix(in srgb, var(--cab-blue) 35%, transparent);
		border-radius: 8px;
		overflow: hidden;
	}

	h4 {
		display: flex;
		gap: var(--cab-space-2);
		margin: 0;
		padding: var(--cab-space-1) var(--cab-space-2);
		background: color-mix(in srgb, var(--cab-blue) 18%, var(--cab-cream));
		font-size: var(--cab-text-xs);
		text-transform: uppercase;
		letter-spacing: 0.08em;
	}

	.role {
		font-weight: 700;
	}

	.section {
		opacity: 0.7;
	}

	pre {
		margin: 0;
		padding: var(--cab-space-2);
		font-family: var(--cab-font-mono);
		font-size: var(--cab-text-xs);
		line-height: 1.5;
		white-space: pre-wrap;
		word-break: break-word;
		background: var(--cab-cream);
	}

	.json {
		max-height: 240px;
		overflow: auto;
	}
</style>
