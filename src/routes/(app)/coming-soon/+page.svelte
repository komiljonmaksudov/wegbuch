<script lang="ts">
	// Not in the navigation on purpose: open /coming-soon directly during the review.
	const previews = [
		{
			id: 'outlook-feed',
			title: 'Outlook-Kalender',
			lead: 'Das Team in dem Kalender, den ihr schon nutzt.',
			how: 'Ein Link zeigt Urlaub und Abwesenheit des Teams in Outlook. Krankheit erscheint nur als „Abwesend“, ohne Grund.'
		},
		{
			id: 'teams-bot',
			title: 'Teams und Slack',
			lead: 'Anträge dort stellen und genehmigen, wo ihr ohnehin schreibt.',
			how: 'Ein Bot nimmt den Antrag an und schickt ihn der Teamleitung. Sie genehmigt oder lehnt mit einem Klick ab.'
		},
		{
			id: 'scim-sync',
			title: 'Anmeldung und Personen',
			lead: 'Die Mitarbeitenden kommen aus dem Firmenverzeichnis.',
			how: 'Die Anmeldung läuft über Microsoft Entra ID. Neue Personen erscheinen hier von selbst. Wer das Unternehmen verlässt, wird deaktiviert. Gelöscht wird nichts.'
		},
		{
			id: 'ai-assistant',
			title: 'Assistent',
			lead: 'Fragen und Anträge in einem Satz.',
			how: 'Du schreibst, was du brauchst. Der Assistent macht einen Entwurf. Gesendet wird erst, wenn du bestätigst.'
		}
	];

	// Clicking a picture opens its video large in a dialog. Closing the dialog removes the video, so it stops.
	let dialog: HTMLDialogElement;
	let current = $state<(typeof previews)[number] | undefined>();
	function open(p: (typeof previews)[number]) {
		current = p;
		dialog.showModal();
	}
</script>

<div class="page">
	<p class="muted intro">Diese vier Ideen sind Skizzen. Sie sind noch nicht gebaut.</p>

	<div class="cards">
		{#each previews as p (p.id)}
			<article class="card" aria-labelledby="t-{p.id}">
				<button type="button" class="thumb" onclick={() => open(p)} aria-label="Video ansehen: {p.title}">
					<img src="/previews/{p.id}.png" alt="" loading="lazy" />
					<span class="play" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M8 5.5v13l11-6.5z" /></svg></span>
				</button>
				<span class="badge">Vorschau, noch nicht verfügbar</span>
				<h2 id="t-{p.id}">{p.title}</h2>
				<p class="lead">{p.lead}</p>
				<p class="muted"><strong>So funktioniert es:</strong> {p.how}</p>
			</article>
		{/each}
	</div>
</div>

<dialog
	bind:this={dialog}
	onclose={() => (current = undefined)}
	onclick={(e) => e.target === dialog && dialog.close()}
	aria-label={current ? `Vorschau: ${current.title}` : 'Vorschau'}
>
	{#if current}
		<div class="head">
			<h2>{current.title}</h2>
			<button type="button" class="btn small" onclick={() => dialog.close()}>Schließen</button>
		</div>
		<!-- svelte-ignore a11y_media_has_caption -->
		<video controls autoplay playsinline poster="/previews/{current.id}.png">
			<source src="/previews/{current.id}.mp4" type="video/mp4" />
		</video>
		<p class="muted note">Vorschau, noch nicht verfügbar. Das ist eine Skizze.</p>
	{/if}
</dialog>

<style>
	.intro {
		margin: 0 0 20px;
	}
	.cards {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
		gap: 28px;
		align-items: start;
	}
	.card {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: 22px 22px 26px;
		background: #fff;
		border-radius: 6px;
		box-shadow: 0 14px 30px rgba(59, 47, 42, 0.12);
	}
	.thumb {
		position: relative;
		display: block;
		width: 100%;
		padding: 0;
		border: 0;
		border-radius: 10px;
		overflow: hidden;
		background: #f1ece4;
		cursor: pointer;
	}
	.thumb img {
		display: block;
		width: 100%;
		aspect-ratio: 16 / 9;
		object-fit: cover;
	}
	.play {
		position: absolute;
		inset: 0;
		margin: auto;
		width: 76px;
		height: 76px;
		display: grid;
		place-items: center;
		border-radius: 999px;
		background: var(--action);
		box-shadow: 0 6px 18px rgba(59, 47, 42, 0.3);
		transition: transform 0.15s ease;
	}
	.play svg {
		width: 34px;
		height: 34px;
		fill: #fff;
		margin-left: 4px;
	}
	.thumb:hover .play,
	.thumb:focus-visible .play {
		transform: scale(1.06);
	}
	dialog {
		--dialog-width: 960px;
		padding-top: 20px;
	}
	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		margin-bottom: 12px;
	}
	.head h2 {
		font-size: 30px;
	}
	dialog video {
		display: block;
		width: 100%;
		max-height: 70vh;
		border-radius: 8px;
		background: #000;
	}
	.note {
		margin-top: 10px;
		font-size: 14px;
	}
	.badge {
		align-self: flex-start;
		padding: 4px 12px;
		border-radius: 10px;
		background: var(--wait-bg);
		color: var(--wait-ink);
		font-size: 14px;
		font-weight: 800;
	}
	h2 {
		margin: 0;
		font-size: 34px;
	}
	p {
		margin: 0;
	}
	.lead {
		font-size: 18px;
	}
</style>
