<script lang="ts">
	import { page } from '$app/state';

	// Errors that are ours (error(404, '…')) carry a German message. Everything else is already made safe in hooks.server.ts.
	const title = $derived(
		page.status === 404 ? 'Die Seite gibt es nicht' : page.status === 403 ? 'Dafür fehlt dir die Berechtigung' : 'Das hat nicht geklappt'
	);

	// The framework's own messages are English ("Not Found"). Our German line replaces them.
	const text = $derived(
		page.status === 404
			? 'Prüfe die Adresse oder gehe zurück zu Mein Urlaub.'
			: page.status === 401
				? 'Bitte melde dich an.'
				: (page.error?.message ?? 'Bitte versuche es noch einmal.')
	);
</script>

<svelte:head><title>{title} · Wegbuch</title></svelte:head>

<main class="wrap">
	<section class="sticky yellow">
		<h1 class="label">{title}</h1>
		<p>{text}</p>
		<div class="row">
			<a class="btn small" href="/">Zu Mein Urlaub</a>
			{#if page.status === 401}<a class="btn small" href="/login">Neu anmelden</a>{/if}
		</div>
	</section>
</main>

<style>
	.wrap {
		max-width: 520px;
		margin: 72px auto;
		padding: 0 16px;
	}
	h1 {
		font-size: 34px;
		margin: 0 0 8px;
	}
	p {
		margin: 0 0 16px;
	}
	.row {
		display: flex;
		gap: 12px;
		flex-wrap: wrap;
	}
</style>
