<script lang="ts">
	import { page } from '$app/state';
	import { fmtMonth, fmtWeekday, initials } from '#lib/format';
	import { reloadOn } from '#lib/live.svelte';
	import { getCalendar } from './calendar.remote';

	// The month and the view live in the address (?m=2026-12&view=hr), so links and the back button work.
	const args = $derived({
		m: page.url.searchParams.get('m') ?? undefined,
		view: page.url.searchParams.get('view') ?? undefined
	});
	const data = $derived(await getCalendar(args));
	// Someone's absence changed: load this month again.
	reloadOn('calendar', () => getCalendar(args).refresh());
	// A person was added or deactivated: the rows change.
	reloadOn('people', () => getCalendar(args).refresh());

	const month = $derived(`${data.year}-${String(data.month).padStart(2, '0')}`);
	const viewQuery = $derived(data.hrView ? '&view=hr' : '');

	const word = { vacation: 'Urlaub', open: 'Antrag offen', absent: 'abwesend', sick: 'krank' } as const;
	// A soft colour per person, like the sketchbook's initials.
	const washes = ['sky', 'green', 'rose', 'honey', 'grey'];
</script>

<div class="page">
	<div class="page-head">
		{#if data.canSwitch}
			<div class="switch" role="group" aria-label="Ansicht als" data-sveltekit-reset="false">
				<span class="muted lbl">Ansicht</span>
				<a href="?m={month}" aria-current={!data.hrView ? 'true' : undefined}>Team</a>
				<a href="?m={month}&view=hr" aria-current={data.hrView ? 'true' : undefined}>HR</a>
			</div>
		{/if}
	</div>

	<!-- reset="false": keep the scroll position and focus when the month changes -->
	<div class="monthnav" data-sveltekit-reset="false">
		<a href="?m={data.prev}{viewQuery}" aria-label="Vorheriger Monat">‹</a>
		<h2>{fmtMonth(data.year, data.month)}</h2>
		<a href="?m={data.next}{viewQuery}" aria-label="Nächster Monat">›</a>
	</div>

	<div class="scroll">
		<table>
			<thead>
				<tr>
					<th class="name"><span class="sr">Person</span></th>
					{#each data.days as d (d.n)}
						<th class={{ weekend: d.weekend, holiday: !!d.holiday }} title={d.holiday}>
							<span class="wd">{fmtWeekday(d.date).slice(0, 2)}</span>
							<span class={['dn', d.date === data.today && 'today']}>{d.n}</span>
						</th>
					{/each}
				</tr>
			</thead>
			<tbody>
				{#each data.people as p, i (p.id)}
					<tr>
						<td class="name">
							<span class="who">
								<span class="ini {washes[i % washes.length]}" aria-hidden="true">{initials(p.name)}</span>
								<span class="nm">{p.name}</span>
								{#if p.isMe}<span class="me">(ich)</span>{/if}
							</span>
						</td>
						{#each data.days as d (d.n)}
							{@const kind = p.cells[d.n]}
							<td class={{ weekend: d.weekend, holiday: !!d.holiday }}>
								{#if kind}<span class="dot {kind}" title={word[kind]}><span class="sr">{word[kind]}</span></span>{/if}
							</td>
						{/each}
					</tr>
				{/each}
				<tr class="sum">
					<td class="name">Weg insgesamt</td>
					{#each data.away as n, i (i)}
						<td>{#if n > 0}<span class={['count', n >= 3 && 'crowded']}>{n}</span>{/if}</td>
					{/each}
				</tr>
			</tbody>
		</table>
	</div>

	<ul class="legend">
		<li><i class="dot vacation"></i>Urlaub</li>
		<li><i class="dot open"></i>Beantragt</li>
		<li><i class="dot absent"></i>Abwesend</li>
		{#if data.hrView}<li><i class="dot sick"></i>Krank</li>{/if}
		<li><i class="swatch holiday"></i>Feiertag NRW</li>
		<li><i class="swatch weekend"></i>Wochenende</li>
	</ul>

	<p class="note tipp">
		{#if data.hrView}Nur HR sieht „krank“.{:else}Das Team sieht nur „abwesend“. Den Grund siehst du hier nicht.{/if}
		Offene Anträge anderer siehst du nicht, nur Teamleitung und HR. Die Zahl wird bei 3 oder mehr gelb.
	</p>

</div>

<style>
	.switch {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 4px;
		border-radius: 999px;
		background: var(--weekend);
	}
	.lbl {
		padding: 0 8px;
		font-size: 14px;
		font-weight: 700;
	}
	.switch a {
		padding: 6px 18px;
		border-radius: 999px;
		color: var(--text);
		text-decoration: none;
		font-weight: 800;
		font-size: 14px;
	}
	.switch a[aria-current='true'] {
		background: var(--text);
		color: #fff;
	}
	.monthnav {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-top: -8px;
	}
	.monthnav h2 {
		font-size: 38px;
	}
	.monthnav a {
		width: 44px;
		height: 44px;
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--brown);
		font-size: 26px;
		font-weight: 800;
		text-decoration: none;
	}

	.scroll {
		overflow-x: auto;
	}
	table {
		table-layout: fixed;
		min-width: 1040px;
		border-collapse: collapse;
		font-size: 12px;
	}
	th,
	td {
		padding: 0;
		text-align: center;
		vertical-align: middle;
		border-bottom: 1px solid #e6dccf;
	}
	th {
		height: 48px;
		border-bottom: 1.5px solid var(--line);
		font-weight: 700;
		color: var(--text);
	}
	td {
		height: 40px;
	}
	th.name,
	td.name {
		width: 190px;
		text-align: left;
		position: sticky;
		left: 0;
		background: var(--sheet);
		z-index: 1;
	}
	.weekend {
		background: var(--weekend);
	}
	.holiday {
		background: var(--holiday);
	}
	.wd {
		display: block;
		font-size: 11px;
		color: var(--muted);
	}
	.dn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 22px;
		height: 22px;
		border-radius: 999px;
		font-size: 13px;
		font-weight: 800;
	}
	.dn.today {
		background: #b8392f;
		color: #fff;
	}

	.who {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 4px 8px 4px 0;
		min-width: 0;
	}
	.nm {
		font-size: 14px;
		font-weight: 700;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.me {
		font-size: 13px;
		color: var(--muted);
		white-space: nowrap;
	}
	.ini {
		position: relative;
		isolation: isolate;
		flex: none;
		width: 30px;
		height: 30px;
		display: flex;
		align-items: center;
		justify-content: center;
		font-weight: 800;
		font-size: 11px;
		color: var(--text);
	}
	.ini::before {
		content: '';
		position: absolute;
		inset: 0;
		z-index: -1;
		border-radius: 999px;
		background: var(--wash);
		filter: var(--paint);
	}
	.sky {
		--wash: var(--sky);
	}
	.green {
		--wash: var(--ok-bg);
	}
	.rose {
		--wash: var(--no-bg);
	}
	.honey {
		--wash: var(--wait-bg);
	}
	.grey {
		--wash: #e4dcd0;
	}

	/* round dots like the design. Brightness differs, so they also work in grey. */
	.dot {
		display: inline-block;
		width: 22px;
		height: 22px;
		border-radius: 999px;
		vertical-align: middle;
	}
	.dot.vacation {
		background: var(--blue);
	}
	.dot.open {
		background: var(--sky);
		border: 1.5px dashed var(--blue);
	}
	.dot.absent {
		background: #8c8077;
	}
	.dot.sick {
		background: var(--sick);
	}
	.legend .dot {
		width: 14px;
		height: 14px;
	}

	.sum td {
		border-bottom: 0;
		border-top: 1px solid var(--line);
		font-weight: 700;
	}
	.sum td.name {
		font-size: 14px;
		color: var(--muted);
	}
	.count {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 22px;
		height: 22px;
		border-radius: 8px;
		font-size: 13px;
	}
	.count.crowded {
		background: var(--wait-bg);
		color: var(--wait-ink);
		font-weight: 800;
	}

	.legend {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 8px 22px;
		font-size: 14px;
		font-weight: 700;
	}
	.legend li {
		display: inline-flex;
		align-items: center;
		gap: 8px;
	}
	.swatch {
		display: inline-block;
		width: 14px;
		height: 14px;
		border-radius: 4px;
	}
	.swatch.holiday {
		background: var(--holiday);
	}
	.swatch.weekend {
		background: var(--weekend);
		border: 1px solid #d9cfc2;
	}
	.tipp {
		margin: 0;
		max-width: 640px;
		font-size: 14px;
	}
</style>
