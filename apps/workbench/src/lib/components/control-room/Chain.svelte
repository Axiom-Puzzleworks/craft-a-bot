<script lang="ts">
	import type { Attestation, Principal } from '@craftabot/core';

	/**
	 * **Chain** (WP65, `55-PRINCIPAL.md` §4.5; `44-…` §4.3's set named it):
	 * the delegation chain behind an action — who did it, for whom, and for
	 * whom again — with who approved it and which rules let it through.
	 * Words on the panel, never colour alone; every value is on the trace.
	 */
	interface Props {
		attestation?: Attestation | undefined;
		/** For an `approval.resolved` row: who answered. */
		by?: Principal | undefined;
		testId?: string | undefined;
	}

	let { attestation, by, testId }: Props = $props();

	/** The chain as a list, the actor first, then each principal it acts for. */
	function links(principal: Principal): Principal[] {
		const out: Principal[] = [];
		for (let at: Principal | undefined = principal; at; at = at.onBehalfOf) out.push(at);
		return out;
	}
	const label = (principal: Principal) => principal.name ?? principal.id;
</script>

<div class="chain" data-testid={testId}>
	{#if attestation}
		<dl>
			<div>
				<dt>Who</dt>
				<dd data-testid={testId ? `${testId}-who` : undefined}>
					{#each links(attestation.principal) as link, index (index)}
						{#if index > 0}<span class="for" aria-hidden="true">→ for</span><span class="sr-only"
								>for</span
							>{/if}
						<span class="link" data-kind={link.kind}
							><span class="kind">{link.kind}</span> {label(link)}</span
						>
					{/each}
				</dd>
			</div>
			<div>
				<dt>Approved by</dt>
				<dd data-testid={testId ? `${testId}-approved-by` : undefined}>
					{#if attestation.approvedBy}
						<span class="link" data-kind={attestation.approvedBy.kind}
							><span class="kind">{attestation.approvedBy.kind}</span>
							{label(attestation.approvedBy)}</span
						>
					{:else}
						nobody was asked
					{/if}
				</dd>
			</div>
			<div>
				<dt>Rules passed</dt>
				<dd class="mono" data-testid={testId ? `${testId}-rules` : undefined}>
					{attestation.guardrailsPassed.length === 0
						? 'none looked'
						: attestation.guardrailsPassed.join(', ')}
				</dd>
			</div>
		</dl>
	{:else if by}
		<dl>
			<div>
				<dt>Answered by</dt>
				<dd data-testid={testId ? `${testId}-who` : undefined}>
					<span class="link" data-kind={by.kind}
						><span class="kind">{by.kind}</span> {label(by)}</span
					>
				</dd>
			</div>
		</dl>
	{/if}
</div>

<style>
	.chain {
		padding: var(--cab-space-2) var(--cab-space-3);
		background: var(--cab-metal);
		border: var(--cab-border-panel) solid var(--cab-ink-muted);
		border-radius: var(--cab-radius-panel);
		font-size: var(--cab-text-sm);
	}

	dl {
		display: grid;
		gap: var(--cab-space-1);
		margin: 0;
	}

	dl > div {
		display: grid;
		grid-template-columns: 7em 1fr;
		gap: var(--cab-space-2);
		align-items: baseline;
	}

	dt {
		font-size: var(--cab-text-xs);
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--cab-ink-muted);
	}

	dd {
		margin: 0;
		display: flex;
		flex-wrap: wrap;
		gap: var(--cab-space-1);
		align-items: baseline;
	}

	.link {
		padding: 0 var(--cab-space-2);
		border: 1px solid currentcolor;
		border-radius: var(--cab-radius-pill);
	}

	.kind {
		font-size: var(--cab-text-xs);
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--cab-ink-muted);
	}

	.for {
		font-size: var(--cab-text-xs);
		color: var(--cab-ink-muted);
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
	}
</style>
