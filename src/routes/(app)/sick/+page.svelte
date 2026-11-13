<script lang="ts">
	import { onMount } from 'svelte';
	import { fmtDay } from '#lib/format';
	import { getSickScreen, reportSick } from './sick.remote';

	const data = $derived(await getSickScreen());

	// One id per opened page, set in the browser.
	let commandId = $state('');
	onMount(() => (commandId = crypto.randomUUID()));

	let since = $state<'today' | 'yesterday' | 'other'>('today');
</script>

<div class="page layout">
	<div class="main">
	<div class="intro">
		<p class="lead">Gute Besserung!</p>
		<svg class="cup" viewBox="0 0 96 80" aria-hidden="true">
			<path d="M34 16 C30 10 38 8 34 2 M48 18 C44 11 52 9 48 3 M62 16 C58 10 66 8 62 2" stroke="#d6a7a1" stroke-width="2.4" fill="none" stroke-linecap="round" />
			<ellipse cx="46" cy="72" rx="34" ry="5" fill="#e6d8cc" />
			<path d="M16 26 H76 C76 50 70 66 46 66 C22 66 16 50 16 26 Z" fill="#f1c1bd" />
			<path d="M76 32 C90 30 90 52 74 52" stroke="#f1c1bd" stroke-width="5" fill="none" stroke-linecap="round" />
			<path d="M46 56 C34 48 32 38 39 36 C43 35 46 38 46 40 C46 38 49 35 53 36 C60 38 58 48 46 56 Z" fill="#fffdf9" />
		</svg>
	</div>

	<form {...reportSick} class="stack">
		<input {...reportSick.fields.commandId.as('hidden', commandId)} />

		<fieldset class="since">
			<legend>Krank seit</legend>
			<div class="chips">
				<label class={['chip', since === 'today' && 'on']}>
					<input {...reportSick.fields.since.as('radio', 'today')} bind:group={since} />
					Heute, {fmtDay(data.today)}
				</label>
				<label class={['chip', since === 'yesterday' && 'on']}>
					<input {...reportSick.fields.since.as('radio', 'yesterday')} bind:group={since} />
					Gestern, {fmtDay(data.yesterday)}
				</label>
				<label class={['chip', since === 'other' && 'on']}>
					<input {...reportSick.fields.since.as('radio', 'other')} bind:group={since} />
					Anderes Datum
				</label>
			</div>
			{#if since === 'other'}
				<label class="field">
					Datum
					<input class="line" {...reportSick.fields.date.as('date')} max={data.today} required />
				</label>
			{/if}
		</fieldset>

		<label class="field until">
			<span>Voraussichtlich bis <span class="opt">(optional)</span></span>
			<input class="line" {...reportSick.fields.until.as('date')} min={data.today} />
		</label>

		{#each reportSick.fields.allIssues() ?? [] as issue (issue.message)}<p class="error" role="alert">{issue.message}</p>{/each}

		<div class="row buttons">
			<a class="btn" href="/">Abbrechen</a>
			<button type="submit" class="btn dark">Krankmeldung senden</button>
		</div>
	</form>
	</div>

	<aside class="side" aria-labelledby="good">
		<h2 id="good" class="label">Gut zu wissen</h2>
		<ul class="notes">
			<li class="blue">Team sieht nur „abwesend“</li>
			<li class="grey">Ab Tag 4: eAU vom Arzt</li>
			<li class="green">Krank im Urlaub: Tage zurück</li>
		</ul>
	</aside>
</div>

<style>
	/* Form on the left, the good-to-know notes on the right. One column on a phone. */
	.layout {
		display: grid;
		grid-template-columns: minmax(0, 560px) minmax(240px, 340px);
		gap: 40px 64px;
		align-items: start;
	}
	@media (max-width: 900px) {
		.layout {
			grid-template-columns: minmax(0, 1fr);
		}
	}
	.side {
		display: flex;
		flex-direction: column;
		gap: 14px;
		padding-top: 56px;
	}
	.side h2 {
		margin: 0;
		font-size: 30px;
	}
	.intro {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		margin-top: -12px;
	}
	.lead {
		margin: 0;
		font-size: 17px;
		color: var(--muted);
	}
	.cup {
		width: 96px;
		height: 80px;
		margin-top: -44px;
	}
	.stack {
		display: flex;
		flex-direction: column;
		gap: 26px;
	}
	fieldset {
		border: 0;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	legend {
		padding: 0;
		margin-bottom: 10px;
		font-size: 14px;
		font-weight: 800;
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
	}
	.chip {
		position: relative;
		padding: 8px 18px;
		border: 1.5px solid #9db4d1;
		border-radius: 999px;
		font-size: 14px;
		font-weight: 800;
		cursor: pointer;
	}
	.chip input {
		position: absolute;
		opacity: 0;
		inset: 0;
		margin: 0;
		cursor: pointer;
	}
	.chip.on {
		background: var(--blue);
		border-color: var(--blue);
		color: #fff;
	}
	.chip:focus-within {
		outline: 2px solid var(--blue);
		outline-offset: 2px;
	}
	.until {
		max-width: 260px;
	}
	.opt {
		font-weight: 400;
		color: var(--muted);
	}
	.notes {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	.notes li {
		position: relative;
		isolation: isolate;
		flex: 0 0 auto;
		padding: 18px 20px;
		font-size: 14px;
		font-weight: 700;
	}
	.notes li::before {
		content: '';
		position: absolute;
		inset: 0;
		z-index: -1;
		background: var(--wash);
		border-radius: 10px;
		filter: var(--paint-big);
		clip-path: var(--torn);
	}
	.blue {
		--wash: var(--sky);
		color: var(--blue-ink);
	}
	.grey {
		--wash: #e9e2d8;
		color: #4a3f39;
	}
	.green {
		--wash: var(--ok-bg);
		color: var(--ok-ink);
	}
	.buttons {
		justify-content: flex-end;
	}
</style>
