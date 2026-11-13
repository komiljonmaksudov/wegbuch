<script lang="ts">
	import { page } from '$app/state';
	import { reloadOn } from '#lib/live.svelte';
	import { getHistory } from './history.remote';

	// The chosen person lives in the address (?e=anna), so the picker is a plain GET form and the back button works.
	const args = $derived({ e: page.url.searchParams.get('e') ?? undefined });
	const data = $derived(await getHistory(args));
	reloadOn('history', () => getHistory(args).refresh());

	const sign = (n: number) => (n > 0 ? `+${n}` : `−${Math.abs(n)}`);
	const at = (iso: string) => iso.slice(8, 10) + '.' + iso.slice(5, 7) + '. ' + iso.slice(11, 16);

	// A colour per kind of event, in the sketchbook's washes.
	const tone: Record<string, string> = {
		EntitlementGranted: 'sky',
		VacationRequested: 'honey',
		VacationApproved: 'green',
		VacationRejected: 'red',
		VacationCancelled: 'grey',
		SickReported: 'red'
	};
</script>

<div class="page">
	<div class="page-head">
		<p class="muted">Alles, was für eine Person passiert ist. Nichts wird überschrieben.</p>
		<!-- choosing a person shows them at once. Without JavaScript the button is there. -->
		<form method="GET" class="row" data-sveltekit-reset="false">
			<label class="pick">
				<span>Person</span>
				<select name="e" onchange={(e) => e.currentTarget.form?.requestSubmit()}>
					{#each data.people as p (p.id)}
						<option value={p.id} selected={p.id === data.employeeId}>{p.name}</option>
					{/each}
				</select>
			</label>
			<noscript><button class="btn small" type="submit">Anzeigen</button></noscript>
		</form>
	</div>

	<div class="cols">
		<section class="main" aria-labelledby="ev">
			<h2 id="ev">Ereignisse von {data.person.name}</h2>
			<ol class="events">
				{#each data.rows as row (row.seq)}
					<li>
						<span class="when muted">{at(row.at)}</span>
						<span class="chip {tone[row.type] ?? 'grey'}">{row.type}</span>
						<span class="what">{row.text}</span>
					</li>
				{/each}
			</ol>

		</section>

		<aside class="side">
			<section class="sticky yellow" aria-labelledby="sum">
				<h2 id="sum" class="label">So entsteht der Resturlaub</h2>
				<p class="sum">
					{#each data.ledger as line, i (i)}<span>{sign(line.delta)}</span>{' '}{/each}
					= <strong>{data.remaining}</strong>
				</p>
				<ul class="lines">
					{#each data.ledger as line, i (i)}
						<li><span class="d">{sign(line.delta)}</span> {line.label}</li>
					{/each}
				</ul>
				<p class="foot">Der Stand wird nie gespeichert. Er wird bei jedem Aufruf aus den Ereignissen berechnet.</p>
			</section>
		</aside>
	</div>
</div>

<style>
	.pick {
		display: flex;
		align-items: baseline;
		gap: 10px;
		font-size: 14px;
		font-weight: 800;
	}
	.pick span {
		color: var(--muted);
	}
	.pick select {
		font-size: 16px;
		min-width: 180px;
	}
	.events {
		list-style: none;
		margin: 6px 0 0;
		padding: 0;
	}
	.events li {
		display: grid;
		grid-template-columns: 96px 210px minmax(0, 1fr);
		gap: 14px;
		align-items: baseline;
		padding: 12px 0;
		border-bottom: 1px solid var(--line-soft);
	}
	.when {
		font-size: 14px;
		font-weight: 700;
	}
	.chip {
		position: relative;
		isolation: isolate;
		justify-self: start;
		padding: 2px 10px;
		font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
		font-size: 13px;
	}
	.chip::before {
		content: '';
		position: absolute;
		inset: 0;
		z-index: -1;
		border-radius: 10px;
		background: var(--wash);
		filter: var(--paint);
	}
	.sky {
		--wash: var(--sky);
		color: var(--blue-ink);
	}
	.honey {
		--wash: var(--wait-bg);
		color: var(--wait-ink);
	}
	.green {
		--wash: var(--ok-bg);
		color: var(--ok-ink);
	}
	.red {
		--wash: var(--no-bg);
		color: var(--no-ink);
	}
	.grey {
		--wash: #e9e2d8;
		color: #4a3f39;
	}
	.sum {
		font-size: 24px;
		font-weight: 800;
		margin: 0 0 12px;
	}
	.sum span {
		margin-right: 4px;
	}
	.lines {
		list-style: none;
		margin: 0 0 14px;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.d {
		display: inline-block;
		min-width: 2.2em;
		font-weight: 800;
	}
	.foot {
		margin: 0;
		font-size: 14px;
	}
	@media (max-width: 760px) {
		.events li {
			grid-template-columns: 1fr;
			gap: 2px;
		}
	}
</style>
