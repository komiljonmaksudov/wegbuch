<script lang="ts">
	let { status }: { status: 'open' | 'approved' | 'rejected' | 'cancelled' | 'sick' } = $props();

	// A word and a small icon, never colour alone.
	const looks = {
		open: { text: 'Offen', cls: 'wait' },
		approved: { text: 'Genehmigt', cls: 'ok' },
		rejected: { text: 'Abgelehnt', cls: 'no' },
		cancelled: { text: 'Storniert', cls: 'grey' },
		sick: { text: 'Gemeldet', cls: 'grey' }
	} as const;
	const look = $derived(looks[status]);
</script>

<span class="badge {look.cls}">
	<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
		{#if status === 'open'}
			<!-- a clock: still waiting -->
			<circle cx="8" cy="8" r="6" /><path d="M8 4.5V8l2.5 1.5" />
		{:else if status === 'approved'}
			<path d="M3 8.5l3.2 3.2L13 4.8" />
		{:else if status === 'rejected'}
			<path d="M4 4l8 8M12 4l-8 8" />
		{:else if status === 'cancelled'}
			<!-- a turn-back arrow: taken back -->
			<path d="M6 3.5L3 6.5l3 3" /><path d="M3 6.5h6a4 4 0 0 1 0 8H7" />
		{:else}
			<circle cx="8" cy="8" r="3.5" fill="currentColor" stroke="none" />
		{/if}
	</svg>
	{look.text}
</span>

<style>
	/* a painted wash behind the word, the word itself stays crisp */
	.badge {
		position: relative;
		isolation: isolate;
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 5px 12px;
		font-weight: 800;
		font-size: 14px;
		white-space: nowrap;
	}
	.badge::before {
		content: '';
		position: absolute;
		inset: 0;
		z-index: -1;
		border-radius: 12px;
		background: var(--wash);
		filter: var(--paint);
	}
	.wait {
		--wash: var(--wait-bg);
		color: var(--wait-ink);
	}
	.wait::before {
		outline: 1.5px dashed var(--wait-ink);
		outline-offset: -3px;
	}
	.ok {
		--wash: var(--ok-bg);
		color: var(--ok-ink);
	}
	.no {
		--wash: var(--no-bg);
		color: var(--no-ink);
	}
	.grey {
		--wash: #e9e2d8;
		color: #4a3f39;
	}
</style>
