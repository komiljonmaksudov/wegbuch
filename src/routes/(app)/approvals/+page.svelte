<script lang="ts">
	import StatusBadge from '#lib/components/StatusBadge.svelte';
	import { fmtDays, fmtRange, fmtWeekday, initials } from '#lib/format';

	import { reloadOn } from '#lib/live.svelte';
	import { decide, getPending } from './approvals.remote';

	const data = $derived(await getPending());
	// A new request came in, or someone else decided one: load the list again.
	reloadOn('approvals', () => getPending().refresh());

	const dayKind = { work: 'Arbeitstag', weekend: 'Wochenende', holiday: 'Feiertag' } as const;
</script>

<div class="page">
	{#if data.open.length > 0}
		<p class="muted count">{data.open.length} offen</p>
	{/if}


	<div class="cols">
		<div class="main sheets">
			{#if data.open.length === 0}
				<!-- nothing to decide: say so warmly and point somewhere useful -->
				<section class="empty" aria-labelledby="done">
					<svg class="tick" viewBox="0 0 80 80" aria-hidden="true" fill="none" stroke="#4f7a3e" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">
						<path d="M40 8 C60 6 74 22 72 42 C70 62 54 74 36 72 C18 70 6 54 8 36 C10 20 22 10 40 8" />
						<path d="M24 41 L35 52 L57 28" />
					</svg>
					<div class="words">
						<h2 id="done">Alles erledigt!</h2>
						<p>Es wartet nichts auf deine Entscheidung. Neue Anträge erscheinen hier.</p>
						<div class="row">
							<a class="btn" href="/calendar">Zum Teamkalender</a>
						</div>
					</div>
				</section>
			{/if}
			{#each data.open as p (p.request.requestId)}
				{@const d = decide.for(p.request.requestId)}
				<article class="sheet-card stack" aria-label="Antrag von {p.employeeName}">
					<div class="head">
						<span class="avatar" aria-hidden="true">{initials(p.employeeName)}</span>
						<div class="who">
							<h3>{p.employeeName}</h3>
							<StatusBadge status="open" />
						</div>
						<div class="days">
							<span class="big">{fmtDays(p.request.days)}</span>
							<span class="muted small">Resturlaub {p.remainingBefore} → {p.remainingAfter}</span>
						</div>
					</div>

					<strong>{fmtRange(p.request.from, p.request.to)}</strong>
					<div class="strip" role="list" aria-label="Die Tage des Antrags">
						{#each p.strip as d (d.date)}
							<div class="day {d.kind}" role="listitem" aria-label="{fmtWeekday(d.date)} {d.n}., {dayKind[d.kind]}">
								<span class="wd">{fmtWeekday(d.date).slice(0, 2)}</span><span>{d.n}</span>
							</div>
						{/each}
					</div>

					{#if p.request.comment}<p class="quote">„{p.request.comment}“</p>{/if}
					{#if p.remainingAfter < 0}
						<p class="warn">Genehmigen geht nicht: Es sind nicht genug Tage übrig.</p>
					{/if}
					{#if p.away.length > 0}
						<!-- one name per person, even if they are away twice in these days -->
						<p class="warn">Auch weg: {[...new Set(p.away.map((a) => a.name))].join(', ')}</p>
					{/if}

					<form {...d} class="stack">
						<input {...d.fields.employeeId.as('hidden', p.employeeId)} />
						<input {...d.fields.requestId.as('hidden', p.request.requestId)} />
						<label class="field">
							Kommentar (optional)
							<textarea {...d.fields.comment.as('text')} rows="2" maxlength="500"></textarea>
						</label>
						{#each d.fields.allIssues() ?? [] as issue (issue.message)}<p class="error" role="alert">{issue.message}</p>{/each}
						<div class="row buttons">
							<button class="btn reject" {...d.fields.decision.as('submit', 'reject')}>Ablehnen</button>
							<button class="btn approve" {...d.fields.decision.as('submit', 'approve')} disabled={p.remainingAfter < 0}>
								Genehmigen
							</button>
						</div>
					</form>
				</article>
			{/each}
		</div>

		<aside class="side">
			<section class="sticky yellow">
				<h2 class="label">Zuletzt entschieden</h2>
				{#if data.recent.length === 0}
					<p class="empty">Noch nichts.</p>
				{:else}
					<ul class="recent">
						{#each data.recent as r (r.request.requestId)}
							<li>
								<strong>{r.employeeName}</strong>
								<span>{fmtRange(r.request.from, r.request.to)}</span>
								<StatusBadge status={r.request.status} />
							</li>
						{/each}
					</ul>
				{/if}
			</section>
		</aside>
	</div>
</div>

<style>
	.sheets {
		gap: 34px;
	}
	.stack {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	.stack p {
		margin: 0;
	}
	.count {
		margin: 0;
	}
	/* the "all done" block: painted like the hero on Mein Urlaub, with a hand-drawn tick */
	.empty {
		position: relative;
		isolation: isolate;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 20px 32px;
		padding: 44px 48px;
	}
	.empty::before {
		content: '';
		position: absolute;
		inset: 0;
		z-index: -1;
		background: var(--ok-bg);
		border-radius: 26px;
		filter: var(--paint-big);
		clip-path: var(--torn);
	}
	.tick {
		width: 84px;
		height: 84px;
		flex: none;
	}
	.words {
		display: flex;
		flex-direction: column;
		gap: 8px;
		color: var(--ok-ink);
	}
	.words h2 {
		font-size: 44px;
		color: var(--ok-ink);
	}
	.words p {
		margin: 0;
		font-size: 17px;
		font-weight: 700;
	}
	.words .row {
		margin-top: 8px;
	}
	.head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 14px;
	}
	.avatar {
		position: relative;
		isolation: isolate;
		width: 48px;
		height: 48px;
		display: flex;
		align-items: center;
		justify-content: center;
		font-weight: 800;
		color: var(--blue-ink);
	}
	.avatar::before {
		content: '';
		position: absolute;
		inset: 0;
		z-index: -1;
		border-radius: 999px;
		background: var(--sky);
		filter: var(--paint);
	}
	.who {
		flex-grow: 1;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 2px;
	}
	h3 {
		margin: 0;
		font-size: 20px;
		font-weight: 800;
	}
	.days {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
	}
	.big {
		font-family: Caveat, cursive;
		font-size: 46px;
		font-weight: 700;
		line-height: 0.9;
		color: var(--blue);
	}
	.small {
		font-size: 14px;
		font-weight: 700;
	}
	.strip {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.day {
		width: 54px;
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 6px 0;
		border-radius: 12px;
		font-weight: 800;
		background: var(--sky);
		color: var(--blue-ink);
	}
	.day.weekend {
		background: var(--weekend);
		color: var(--muted);
	}
	.day.holiday {
		background: var(--holiday);
		color: var(--wait-ink);
	}
	.wd {
		font-size: 12px;
		font-weight: 700;
	}
	.quote {
		font-style: italic;
		color: #5a4c44;
	}
	.buttons {
		justify-content: flex-end;
	}
	.recent {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	.recent li {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 2px;
	}
	.empty {
		margin: 0;
	}
</style>
