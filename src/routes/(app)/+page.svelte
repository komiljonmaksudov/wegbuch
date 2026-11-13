<script lang="ts">
	import StatusBadge from '#lib/components/StatusBadge.svelte';
	import { fmtDate, fmtDays, fmtRange, fmtShortRange, fmtWeekday } from '#lib/format';

	import { reloadOn } from '#lib/live.svelte';
	import { getManagerName } from './me.remote';
	import { cancelRequest, getOverview } from './overview.remote';

	// Both queries start together. Two separate awaits one after the other would wait twice (a "waterfall").
	const loaded = $derived(await Promise.all([getOverview(), getManagerName()]));
	const data = $derived(loaded[0]);
	const managerName = $derived(loaded[1]);
	// Someone decided a request of mine, or I changed something: load the entries again.
	reloadOn('mine', () => getOverview().refresh());

	// Only the next three holidays, the rest behind one button.
	let allHolidays = $state(false);
	const shownHolidays = $derived(allHolidays ? data.holidays : data.holidays.slice(0, 3));

	const b = $derived(data.balance);
	const free = $derived(b.entitlement - b.taken - b.requested);
	// One dot per vacation day of the year: taken, asked for, still free.
	const dots = $derived(
		Array.from({ length: b.entitlement }, (_, i) =>
			i < b.taken ? 'taken' : i < b.taken + b.requested ? 'req' : 'free'
		)
	);
</script>

<div class="page">
	<section class="hero" aria-labelledby="rest">
		<div class="wash" aria-hidden="true">
			<svg class="scenery" viewBox="0 0 400 160" preserveAspectRatio="xMaxYMax meet" aria-hidden="true">
				<circle cx="300" cy="46" r="22" fill="#F6D27A" />
				<path d="M0 160 C60 90 120 100 190 120 C250 70 330 80 400 110 L400 160 Z" fill="#A9CF8E" />
				<path d="M0 160 C90 120 170 135 260 145 C320 125 370 128 400 140 L400 160 Z" fill="#7FB36A" />
				<path d="M232 152 C228 128 236 118 240 104 C244 118 252 128 248 152 Z" fill="#5E8F4E" />
			</svg>
		</div>
		<span class="huge" aria-hidden="true">{b.remaining}</span>
		<div class="hero-main">
			<h2 id="rest"><span class="sr">{b.remaining} </span>Tage übrig, von {b.entitlement}</h2>
			<div class="dots" role="img" aria-label="{b.taken} Tage genommen, {b.requested} beantragt, {free} frei">
				{#each dots as kind, i (i)}<span class={kind}></span>{/each}
			</div>
			<div class="legend">
				<span><i class="mark taken"></i>{b.taken} genommen</span>
				<span><i class="mark req"></i>{b.requested} beantragt</span>
				<span><i class="mark free"></i>{free} frei</span>
			</div>
		</div>
	</section>

	<div class="row">
		<a class="btn primary" href="/request">Urlaub beantragen</a>
		<a class="btn" href="/sick">Krank melden</a>
	</div>

	{#each cancelRequest.fields.allIssues() ?? [] as issue (issue.message)}<p class="error" role="alert">{issue.message}</p>{/each}

	<div class="cols">
		<section class="main" aria-labelledby="antr">
			<h2 id="antr">Meine Einträge</h2>
			{#if data.rows.length === 0}
				<p class="muted">Noch nichts da. Beantrage Urlaub oder melde dich krank.</p>
			{:else}
				<ul class="entries">
					{#each data.rows as row (row.kind === 'vacation' ? row.requestId : `sick-${row.from}-${row.to}`)}
						<li>
							<span class="date" title={fmtRange(row.from, row.to)}>{fmtShortRange(row.from, row.to)}</span>
							<span class="what">
								{#if row.kind === 'vacation'}
									{row.comment ?? 'Urlaub'}
									<small class="muted">
										{#if row.status === 'open'}Wartet auf {managerName ?? 'HR'}
										{:else if row.status === 'approved'}Genehmigt von {row.decidedByName}
										{:else if row.status === 'rejected'}{row.decisionComment ? `„${row.decisionComment}“` : `Abgelehnt von ${row.decidedByName}`}
										{:else}Storniert{/if}
										{#if row.creditedDays > 0}· {fmtDays(row.creditedDays)} wegen Krankheit zurück{/if}
									</small>
									{#if row.canCancel}
										{@const cancel = cancelRequest.for(row.requestId)}
										<form {...cancel}>
											<input {...cancel.fields.requestId.as('hidden', row.requestId)} />
											<button class="link" type="submit">Stornieren</button>
										</form>
									{/if}
								{:else}
									Krank{#if row.creditedDays > 0}, +{row.creditedDays} {row.creditedDays === 1 ? 'Tag' : 'Tage'} zurück{/if}
								{/if}
							</span>
							<span class="days">
								{row.kind === 'vacation' ? row.days - row.creditedDays : row.days}
								{#if row.kind === 'vacation' && row.creditedDays > 0}<s class="was">{row.days}</s>{/if}
							</span>
							<span class="state"><StatusBadge status={row.kind === 'vacation' ? row.status : 'sick'} /></span>
						</li>
					{/each}
				</ul>
			{/if}
		</section>

		<aside class="side">
			<section class="sticky yellow" aria-labelledby="vf">
				<h2 id="vf" class="label">Nicht vergessen!</h2>
				<p>Plane deinen Urlaub früh. Resturlaub aus dem Vorjahr kann verfallen. Das geht nur, wenn HR dich vorher darauf hingewiesen hat.</p>
			</section>
			<section class="sticky white" aria-labelledby="ft">
				<h2 id="ft" class="label">Feiertage NRW</h2>
				<ul class="holidays">
					{#each shownHolidays as h (h.date)}
						<li><strong>{fmtWeekday(h.date)} {fmtDate(h.date).slice(0, 6)}</strong><span>{h.name}</span></li>
					{/each}
				</ul>
				{#if data.holidays.length > 3}
					<button type="button" class="link more" aria-expanded={allHolidays} onclick={() => (allHolidays = !allHolidays)}>
						{allHolidays ? 'Weniger anzeigen' : `Alle ${data.holidays.length} anzeigen`}
					</button>
				{/if}
			</section>
		</aside>
	</div>
</div>

<style>
	/* the blue painted hero: the brush shape is ::before, numbers and words stay crisp */
	.hero {
		position: relative;
		isolation: isolate;
		padding: 40px 44px;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 24px 48px;
	}
	/* The blue shape and the picture are ONE element, so the brush filter tears them together
	   and the hills end exactly at the torn edge of the card. */
	.wash {
		position: absolute;
		inset: 0;
		z-index: -1;
		overflow: hidden;
		background: var(--sky);
		border-radius: 26px;
		filter: var(--paint-big);
		clip-path: var(--torn);
	}
	/* The picture keeps its own proportions (5 : 2) and sits flush in the bottom right corner.
	   It is never stretched, so the sun stays round on a phone. */
	.scenery {
		position: absolute;
		right: 0;
		bottom: 0;
		width: min(42%, 420px);
		height: auto;
		aspect-ratio: 400 / 160;
		opacity: 0.85;
	}
	.huge {
		font-family: Caveat, cursive;
		font-weight: 700;
		font-size: 170px;
		line-height: 0.8;
		color: var(--blue);
	}
	.hero-main {
		flex: 1 1 380px;
		display: flex;
		flex-direction: column;
		gap: 14px;
		min-width: 0;
	}
	.hero-main h2 {
		font-family: Nunito, system-ui, sans-serif;
		font-size: 22px;
		font-weight: 800;
		color: var(--blue-ink);
		line-height: 1.2;
	}
	.dots {
		display: grid;
		grid-template-columns: repeat(15, 22px);
		gap: 8px 6px;
	}
	.dots span,
	.mark {
		display: inline-block;
		border-radius: 999px;
		box-sizing: border-box;
	}
	.dots span {
		width: 22px;
		height: 22px;
	}
	.mark {
		width: 13px;
		height: 13px;
	}
	.taken {
		background: #4f7a3e;
	}
	.req {
		background: repeating-linear-gradient(45deg, #a86f0e 0 2px, transparent 2px 4px);
		border: 1.5px solid #a86f0e;
	}
	.free {
		border: 1.5px solid #4a5a75;
	}
	.legend {
		display: flex;
		flex-wrap: wrap;
		gap: 6px 20px;
		font-size: 15px;
		font-weight: 700;
		color: var(--blue-ink);
	}
	.legend span {
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}

	/* the entries: date, note, days, status. No header row, nothing wraps. */
	.entries {
		list-style: none;
		margin: 6px 0 0;
		padding: 0;
	}
	.entries li {
		display: grid;
		grid-template-columns: 120px minmax(0, 1fr) 44px 136px;
		gap: 14px;
		align-items: center;
		padding: 14px 0;
		border-bottom: 1px solid var(--line-soft);
	}
	.date {
		font-weight: 800;
		font-size: 17px;
		white-space: nowrap;
	}
	.what {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		font-size: 15px;
		color: var(--muted);
		min-width: 0;
	}
	.what small {
		font-size: 13px;
	}
	.days {
		text-align: right;
		font-weight: 800;
		font-size: 20px;
	}
	.was {
		font-weight: 400;
		font-size: 14px;
		color: var(--muted);
		margin-left: 4px;
	}
	.state {
		justify-self: end;
	}
	.link {
		border: 0;
		background: none;
		padding: 0;
		font: inherit;
		font-size: 13px;
		color: var(--blue);
		text-decoration: underline;
		cursor: pointer;
	}
	.sticky p {
		margin: 0;
	}
	.holidays {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.holidays li {
		display: flex;
		justify-content: space-between;
		gap: 10px;
		padding: 7px 0;
		border-bottom: 1px dashed #d8cebe;
	}
	.holidays li:last-child {
		border-bottom: 0;
	}
	.more {
		margin-top: 8px;
	}
	@media (max-width: 760px) {
		.hero {
			padding: 28px 20px;
		}
		/* On a phone the text fills the card, so the picture is smaller and softer behind it. */
		.scenery {
			width: 58%;
			opacity: 0.5;
		}
		.huge {
			font-size: 120px;
		}
		.dots {
			grid-template-columns: repeat(10, 22px);
		}
		.entries li {
			grid-template-columns: 1fr auto;
		}
		.what {
			grid-column: 1 / -1;
			order: 3;
		}
	}
</style>
