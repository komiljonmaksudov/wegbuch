<script lang="ts">
	import { onMount } from 'svelte';
	import { addDays, countWorkingDays, holidayName, weekday } from '#core/rules-de-nrw';
	import { fmtDate, fmtMonth, fmtRange } from '#lib/format';
	import { reloadOn } from '#lib/live.svelte';
	import { getManagerName } from '../me.remote';
	import { getRequestScreen, requestVacation } from './request.remote';

	// Both queries start together, so the page does not wait twice.
	const loaded = $derived(await Promise.all([getRequestScreen(), getManagerName()]));
	const data = $derived(loaded[0]);
	const managerName = $derived(loaded[1]);
	// A colleague's absence, or my own balance and requests, may change while I choose days.
	reloadOn('calendar', () => getRequestScreen().refresh());
	reloadOn('mine', () => getRequestScreen().refresh());

	// One id per opened page. It is set in the browser, so the server render never shows a made-up id.
	let commandId = $state('');
	onMount(() => (commandId = crypto.randomUUID()));

	let from = $state('');
	let to = $state('');
	let comment = $state('');
	let shown = $state(''); // the month in the picker, "2026-12". Empty means today's month.

	const ym = $derived(shown || data.today.slice(0, 7));
	const monthLabel = $derived(fmtMonth(Number(ym.slice(0, 4)), Number(ym.slice(5, 7))));

	function shift(by: number) {
		const d = new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1 + by, 1));
		shown = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
	}

	// Monday first. Blanks before the 1st, then one cell per day.
	const cells = $derived.by(() => {
		const lead = (weekday(`${ym}-01`) + 6) % 7;
		const last = new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0)).getUTCDate();
		const out: ({ date: string; n: number; weekend: boolean; holiday?: string } | null)[] = Array.from(
			{ length: lead },
			() => null
		);
		for (let n = 1; n <= last; n++) {
			const date = `${ym}-${String(n).padStart(2, '0')}`;
			const wd = weekday(date);
			out.push({ date, n, weekend: wd === 0 || wd === 6, holiday: holidayName(date) });
		}
		return out;
	});

	// First click starts, second click ends. A third click starts again.
	function pick(date: string) {
		if (!from || to) {
			from = date;
			to = '';
		} else if (date < from) {
			from = date;
		} else {
			to = date;
		}
	}
	const isEdge = (d: string) => d === from || d === to;
	const inRange = (d: string) => !!from && !!to && d > from && d < to;

	// The same rules as the server, run live. The server checks again on submit.
	const preview = $derived.by(() => {
		if (!from || !to) return undefined;
		if (to < from) return { error: 'Das Ende liegt vor dem Beginn.' };
		const r = countWorkingDays(from, to);
		let weekendDays = 0;
		let seen = 0;
		for (let d = from; d <= to && seen < 400; d = addDays(d, 1), seen++) {
			const wd = weekday(d);
			if (wd === 0 || wd === 6) weekendDays++;
		}
		return { days: r.days, holidays: r.skippedHolidays.length, weekendDays, after: data.free - r.days };
	});

	const notCounted = $derived.by(() => {
		if (!preview || 'error' in preview) return '';
		const parts = [
			preview.holidays > 0 && `${preview.holidays} ${preview.holidays === 1 ? 'Feiertag' : 'Feiertage'}`,
			preview.weekendDays > 0 && `${preview.weekendDays} ${preview.weekendDays === 1 ? 'Wochenendtag' : 'Wochenendtage'}`
		].filter(Boolean);
		return parts.length ? `${parts.join(' und ')} nicht mitgezählt` : '';
	});

	const away = $derived(from && to && to >= from ? data.team.filter((a) => a.from <= to && from <= a.to) : []);
	const awayNames = $derived([...new Set(away.map((a) => a.name))]);

	// Your own requests (open or approved) show in the calendar. A new one may not overlap them.
	const bookedOn = (date: string) => data.mine.find((r) => r.from <= date && date <= r.to)?.status;
	const clash = $derived(from && to && to >= from ? data.mine.find((r) => r.from <= to && from <= r.to) : undefined);

	const canSend = $derived(
		!!preview && !('error' in preview) && preview.days > 0 && preview.after >= 0 && !clash
	);
</script>

<div class="page">
	<form {...requestVacation} class="layout">
		<input {...requestVacation.fields.commandId.as('hidden', commandId)} />

		<section class="picker" aria-label="Tage wählen">
			<div class="monthnav">
				<button type="button" class="arrow" aria-label="Vorheriger Monat" onclick={() => shift(-1)}>‹</button>
				<h2>{monthLabel}</h2>
				<button type="button" class="arrow" aria-label="Nächster Monat" onclick={() => shift(1)}>›</button>
			</div>
			<div class="grid">
				{#each ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'] as wd (wd)}<span class="wd">{wd}</span>{/each}
				{#each cells as c, i (c ? c.date : `blank-${i}`)}
					{#if c}
						<button
							type="button"
							class={['day', c.weekend && 'weekend', c.holiday && 'holiday', c.date === data.today && 'today', isEdge(c.date) && 'edge', inRange(c.date) && 'inrange', bookedOn(c.date) === 'open' && 'pending', bookedOn(c.date) === 'approved' && 'booked']}
							disabled={c.date < data.today}
							aria-pressed={isEdge(c.date)}
							aria-label="{fmtDate(c.date)}{c.holiday ? `, ${c.holiday}` : ''}{bookedOn(c.date) === 'open' ? ', dein Antrag ist offen' : bookedOn(c.date) === 'approved' ? ', dein Urlaub ist genehmigt' : ''}"
							onclick={() => pick(c.date)}
						>
							{c.n}
						</button>
					{:else}
						<span></span>
					{/if}
				{/each}
			</div>
			<ul class="legend">
				<li><i class="swatch edge"></i>Urlaubstag</li>
				<li><i class="swatch holiday"></i>Feiertag NRW</li>
				<li><i class="swatch weekend"></i>Wochenende</li>
				{#if data.mine.length > 0}
					<li><i class="swatch pending"></i>Beantragt</li>
					<li><i class="swatch booked"></i>Genehmigt</li>
				{/if}
			</ul>
		</section>

		<section class="details">
			<div class="row dates">
				<label class="field">Von <input class="line" {...requestVacation.fields.from.as('date')} bind:value={from} min={data.today} required /></label>
				<label class="field">Bis <input class="line" {...requestVacation.fields.to.as('date')} bind:value={to} min={from || data.today} required /></label>
			</div>

			<div aria-live="polite" class="live">
				{#if preview && 'error' in preview}
					<p class="error">{preview.error}</p>
				{:else if preview}
					<div class="result">
						<strong class="head">Das sind {preview.days} {preview.days === 1 ? 'Arbeitstag' : 'Arbeitstage'}</strong>
						{#if notCounted}<span class="small">{notCounted}</span>{/if}
						<div class="after">
							<span>Resturlaub danach</span>
							<strong>{Math.max(preview.after, 0)} von {data.entitlement} Tagen</strong>
						</div>
					</div>
					{#if preview.days === 0}
						<p class="warn">Im Zeitraum liegt kein Arbeitstag.</p>
					{:else if preview.after < 0}
						<p class="warn">Dafür reichen deine freien Tage nicht.</p>
					{/if}
				{/if}
				{#if clash}
					<p class="warn">
						Das überschneidet deinen Antrag vom {fmtRange(clash.from, clash.to)} ({clash.status === 'open' ? 'noch offen' : 'genehmigt'}).
					</p>
				{/if}
				{#if awayNames.length > 0}
					<p class="sticky yellow away">Auch weg: {awayNames.join(', ')}</p>
				{/if}
			</div>

			<label class="field">
				<span>Kommentar <span class="muted opt">(optional)</span></span>
				<textarea class="line" {...requestVacation.fields.comment.as('text')} rows="2" maxlength="500" bind:value={comment} placeholder="z. B. Weihnachten bei der Familie"></textarea>
			</label>

			{#each requestVacation.fields.allIssues() ?? [] as issue (issue.message)}<p class="error" role="alert">{issue.message}</p>{/each}

			<div class="row buttons">
				<a class="btn" href="/">Abbrechen</a>
				<button type="submit" class="btn primary" disabled={!canSend}>
					{managerName ? `An ${managerName.split(' ')[0]} senden` : 'Antrag senden'}
				</button>
			</div>
		</section>
	</form>
</div>

<style>
	.layout {
		display: flex;
		flex-wrap: wrap;
		gap: 36px 48px;
		align-items: flex-start;
	}
	.picker {
		flex: 0 1 340px;
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	/* On a phone the picker takes the full width and the day cells grow with it. */
	@media (max-width: 760px) {
		.picker {
			flex: 1 1 100%;
		}
		.day {
			max-width: 54px;
		}
	}
	.details {
		flex: 1 1 380px;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 22px;
	}
	.monthnav {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.monthnav h2 {
		font-size: 30px;
	}
	.arrow {
		width: 40px;
		height: 40px;
		border: 0;
		background: none;
		color: var(--brown);
		font-size: 26px;
		font-weight: 800;
		cursor: pointer;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(7, 1fr);
		gap: 6px 4px;
		justify-items: center;
	}
	.wd {
		font-size: 12px;
		font-weight: 800;
		color: var(--muted);
		padding-bottom: 4px;
	}
	.day {
		width: 100%;
		max-width: 44px;
		height: auto;
		aspect-ratio: 1;
		border: 1.5px solid transparent;
		border-radius: 999px;
		background: transparent;
		font: inherit;
		font-weight: 700;
		color: var(--text);
		cursor: pointer;
	}
	.day:disabled {
		color: #b9aea4;
		cursor: not-allowed;
	}
	.day.inrange {
		background: var(--sky);
	}
	.day.weekend {
		background: var(--weekend);
		color: var(--muted);
	}
	.day.holiday {
		background: var(--holiday);
		border-color: var(--text);
		color: var(--wait-ink);
	}
	/* your own requests: a dashed amber ring while open, soft green once approved */
	.day.pending {
		background: var(--wait-bg);
		border: 1.5px dashed var(--wait-ink);
		color: var(--wait-ink);
	}
	.day.booked {
		background: var(--ok-bg);
		border-color: var(--ok-ink);
		color: var(--ok-ink);
	}
	.day.edge {
		background: var(--blue);
		border-color: var(--blue);
		color: #fff;
	}
	.day.today {
		border-color: #b8392f;
	}
	.legend {
		list-style: none;
		margin: 6px 0 0;
		padding: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 6px 18px;
		font-size: 13px;
		font-weight: 700;
	}
	.legend li {
		display: inline-flex;
		align-items: center;
		gap: 7px;
	}
	.swatch {
		width: 13px;
		height: 13px;
		border-radius: 999px;
		display: inline-block;
	}
	.swatch.pending {
		background: var(--wait-bg);
		border: 1.5px dashed var(--wait-ink);
	}
	.swatch.booked {
		background: var(--ok-bg);
		border: 1.5px solid var(--ok-ink);
	}
	.swatch.edge {
		background: var(--blue);
	}
	.swatch.holiday {
		background: var(--holiday);
		border: 1.5px solid var(--text);
	}
	.swatch.weekend {
		background: var(--weekend);
	}

	.dates {
		gap: 24px;
	}
	.dates .field {
		flex: 1 1 160px;
	}
	.live {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	.live p {
		margin: 0;
	}
	.result {
		position: relative;
		isolation: isolate;
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding: 20px 24px;
		color: var(--blue-ink);
	}
	.result::before {
		content: '';
		position: absolute;
		inset: 0;
		z-index: -1;
		background: var(--sky);
		border-radius: 14px;
		filter: var(--paint-big);
		clip-path: var(--torn);
	}
	.head {
		font-size: 20px;
	}
	.small {
		font-size: 14px;
	}
	.after {
		display: flex;
		justify-content: space-between;
		gap: 12px;
		margin-top: 10px;
		padding-top: 10px;
		border-top: 1.5px dotted rgba(28, 49, 87, 0.45);
		font-size: 14px;
	}
	.away {
		padding: 14px 20px;
		transform: rotate(-0.5deg);
		font-weight: 700;
		color: var(--note-ink);
	}
	.opt {
		font-weight: 400;
	}
	.buttons {
		justify-content: flex-end;
	}
</style>
