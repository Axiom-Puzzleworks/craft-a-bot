<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';

	/**
	 * PLAY mode lands in WP6 (world renderer, head-up bar, STEP/PLAY/STOP, thought
	 * bubble, Flight Recorder). WP5 only needs the GO lever to reach this route —
	 * the engine behind it has been running since WP3.
	 */
	const agentId = $derived(page.params.agentId ?? '');
</script>

<svelte:head><title>Playroom — Craft A Bot</title></svelte:head>

<main data-testid="play-placeholder">
	<h1>The Playroom</h1>
	<p>
		Your bot is ready and the engine behind this screen already runs — the world view, the controls,
		and the Flight Recorder arrive in the next work package.
	</p>
	<a href={resolve('/bench/[agentId]', { agentId })}>← Back to the bench</a>
</main>

<style>
	main {
		max-width: 640px;
		margin-inline: auto;
		padding: var(--cab-space-7) var(--cab-space-4);
		display: grid;
		gap: var(--cab-space-3);
		text-align: center;
	}

	h1 {
		margin: 0;
		color: var(--cab-blue-text);
	}

	p {
		margin: 0;
		opacity: 0.85;
	}

	a {
		color: var(--cab-blue-text);
		font-weight: 600;
	}
</style>
