<script lang="ts">
	import { initials } from '#lib/format';
	import { reloadOn } from '#lib/live.svelte';
	import {
		addPerson,
		deactivatePerson,
		getPeople,
		reactivatePerson,
		resetPassword,
		updatePerson
	} from './people.remote';

	const data = $derived(await getPeople());
	// Someone added, changed or deactivated a person: load the list again.
	reloadOn('people', () => getPeople().refresh());

	type Row = Awaited<ReturnType<typeof getPeople>>['people'][number];

	// The one-time password of the last person added, or of the last reset. Shown once, never stored.
	let created = $state<{ kind: 'added' | 'reset'; name: string; email: string; password: string } | undefined>();

	const roleName = { employee: 'Mitarbeiter:in', lead: 'Teamleitung', hr: 'HR' } as const;
	// the same soft colours as the rest of the app: sky for staff, green for leads, honey for HR
	const tone = { employee: 'sky', lead: 'green', hr: 'honey' } as const;

	let query = $state('');
	let editing = $state<Row | undefined>();
	let leaving = $state<Row | undefined>();
	let resetting = $state<Row | undefined>();
	let addRole = $state<'employee' | 'lead' | 'hr'>('employee');
	let editRole = $state<'employee' | 'lead' | 'hr'>('employee');
	let copied = $state(false);

	let addDialog: HTMLDialogElement;
	let editDialog: HTMLDialogElement;
	let leaveDialog: HTMLDialogElement;
	let resetDialog: HTMLDialogElement;

	const shown = $derived(
		data.people.filter((p) => `${p.user.name} ${p.user.email}`.toLowerCase().includes(query.trim().toLowerCase()))
	);

	// A dialog stays open while there is an error to read, and closes when the change worked.
	const closeWhenDone =
		(get: () => HTMLDialogElement, remember = false) =>
		async (f: { submit: () => Promise<boolean>; result?: unknown }) => {
			try {
				if (await f.submit()) {
					// Adding a person and resetting a password return the one-time password. Keep it to show once.
					if (remember) created = f.result as typeof created;
					get().close();
				}
			} catch {
				// the error shows in the dialog
			}
		};

	function edit(p: Row) {
		editing = p;
		editRole = p.user.role;
		editDialog.showModal();
	}
	function leave(p: Row) {
		leaving = p;
		leaveDialog.showModal();
	}
	function resetPw(p: Row) {
		resetting = p;
		resetDialog.showModal();
	}
	function openAdd() {
		addRole = 'employee';
		addDialog.showModal();
	}

	async function copyPassword() {
		try {
			await navigator.clipboard.writeText(created?.password ?? '');
			copied = true;
			setTimeout(() => (copied = false), 2000);
		} catch {
			// no clipboard access: the password stays selectable in the box
		}
	}
</script>

<div class="page">
	<div class="bar">
		<label class="field search">
			<span class="sr">Person suchen</span>
			<input class="line" type="search" placeholder="Person suchen" bind:value={query} />
		</label>
		<button type="button" class="btn primary" onclick={openAdd}>Person hinzufügen</button>
	</div>

	{#if created}
		<section class="sticky yellow once" aria-live="polite">
			<h2 class="label">{created.kind === 'reset' ? `Neues Passwort für ${created.name}` : `${created.name} ist da`}</h2>
			<p>Das Passwort siehst du nur jetzt. Gib es der Person sicher weiter. Danach ist es nicht mehr abrufbar.</p>
			<div class="row">
				<code class="password">{created.password}</code>
				<button type="button" class="btn small" onclick={copyPassword}>{copied ? 'Kopiert' : 'Kopieren'}</button>
			</div>
			<p class="muted small">Anmelden mit: {created.email}</p>
		</section>
	{/if}

	<div class="cols">
		<section class="main" aria-labelledby="list">
			<h2 id="list">{data.people.length} Personen</h2>
			<ul class="people">
				{#each shown as p (p.user.id)}
					<li class={{ off: !p.user.active }}>
						<span class="ini {tone[p.user.role]}" aria-hidden="true">{initials(p.user.name)}</span>
						<span class="who">
							<strong>{p.user.name}{#if p.user.id === data.me}<span class="muted"> (du)</span>{/if}</strong>
							<small class="muted">{p.user.email}</small>
						</span>
						<span class="role">{roleName[p.user.role]}</span>
						<span class="muted lead">{p.managerName ?? '–'}</span>
						<span class="allow">{p.allowance} Tage</span>
						<span class="state"><span class={['chip', p.user.active ? 'on' : 'gone']}>{p.user.active ? 'Aktiv' : 'Deaktiviert'}</span></span>
						<span class="actions">
							<button type="button" class="link" onclick={() => edit(p)}>Bearbeiten</button>
							{#if p.user.active}
								{#if p.user.id !== data.me}
									<button type="button" class="link" onclick={() => resetPw(p)}>Passwort zurücksetzen</button>
								{/if}
								<button type="button" class="link" onclick={() => leave(p)}>Deaktivieren</button>
							{:else}
								{@const back = reactivatePerson.for(p.user.id)}
								<form {...back}>
									<input {...back.fields.id.as('hidden', p.user.id)} />
									<button class="link" type="submit">Wieder aktivieren</button>
								</form>
							{/if}
						</span>
					</li>
				{:else}
					<li class="muted none">Niemand gefunden.</li>
				{/each}
			</ul>
		</section>

		<aside class="side">
			<section class="sticky yellow" aria-labelledby="nodel">
				<h2 id="nodel" class="label">Wir löschen nichts</h2>
				<p>„Deaktivieren“ beendet die Anmeldung. Die Einträge und die Historie bleiben erhalten.</p>
			</section>
		</aside>
	</div>
</div>

<!-- add -->
<dialog bind:this={addDialog} aria-labelledby="add-title">
	<h2 id="add-title">Person hinzufügen</h2>
	<form {...addPerson.enhance(closeWhenDone(() => addDialog, true))} class="stack">
		<label class="field">Name <input class="line" {...addPerson.fields.name.as('text')} required maxlength="100" /></label>
		<label class="field">E-Mail <input class="line" {...addPerson.fields.email.as('email')} required maxlength="200" /></label>
		<label class="field">
			Rolle
			<select {...addPerson.fields.role.as('select')} bind:value={addRole}>
				<option value="employee">Mitarbeiter:in</option>
				<option value="lead">Teamleitung</option>
				<option value="hr">HR</option>
			</select>
		</label>
		{#if addRole === 'employee'}
			<label class="field">
				Teamleitung
				<select {...addPerson.fields.managerId.as('select')} required>
					<option value="" disabled selected>Bitte wählen</option>
					{#each data.leads as l (l.id)}<option value={l.id}>{l.name}</option>{/each}
				</select>
			</label>
		{/if}
		<label class="field">Jahresanspruch (Tage) <input class="line" {...addPerson.fields.allowance.as('number')} value="30" min="0" max="60" required /></label>
		<p class="note">Die Person bekommt ein einmaliges Passwort. Das siehst du nur jetzt.</p>
		{#each addPerson.fields.allIssues() ?? [] as issue (issue.message)}<p class="error" role="alert">{issue.message}</p>{/each}
		<div class="row buttons">
			<button type="button" class="btn" onclick={() => addDialog.close()}>Abbrechen</button>
			<button type="submit" class="btn primary">Hinzufügen</button>
		</div>
	</form>
</dialog>

<!-- edit -->
<dialog bind:this={editDialog} onclose={() => (editing = undefined)} aria-labelledby="edit-title">
	{#if editing}
		{@const f = updatePerson.for(editing.user.id)}
		<h2 id="edit-title">{editing.user.name} bearbeiten</h2>
		<form {...f.enhance(closeWhenDone(() => editDialog))} class="stack">
			<input {...f.fields.id.as('hidden', editing.user.id)} />
			<label class="field">Name <input class="line" {...f.fields.name.as('text', editing.user.name)} required maxlength="100" /></label>
			<label class="field">E-Mail <input class="line" {...f.fields.email.as('email', editing.user.email)} required maxlength="200" /></label>
			<label class="field">
				Rolle
				<select {...f.fields.role.as('select')} bind:value={editRole}>
					<option value="employee">Mitarbeiter:in</option>
					<option value="lead">Teamleitung</option>
					<option value="hr">HR</option>
				</select>
			</label>
			{#if editRole === 'employee'}
				<label class="field">
					Teamleitung
					<select {...f.fields.managerId.as('select')} required>
						{#each data.leads as l (l.id)}<option value={l.id} selected={l.id === editing.user.managerId}>{l.name}</option>{/each}
					</select>
				</label>
			{/if}
			<label class="field">Jahresanspruch (Tage) <input class="line" {...f.fields.allowance.as('number', editing.allowance)} min="0" max="60" required /></label>
			<p class="note">Ändert sich der Anspruch, wird das als neues Ereignis gespeichert.</p>
			{#each f.fields.allIssues() ?? [] as issue (issue.message)}<p class="error" role="alert">{issue.message}</p>{/each}
			<div class="row buttons">
				<button type="button" class="btn" onclick={() => editDialog.close()}>Abbrechen</button>
				<button type="submit" class="btn primary">Speichern</button>
			</div>
		</form>
	{/if}
</dialog>

<!-- reset password -->
<dialog bind:this={resetDialog} onclose={() => (resetting = undefined)} aria-labelledby="reset-title">
	{#if resetting}
		{@const f = resetPassword.for(resetting.user.id)}
		<h2 id="reset-title">Neues Passwort für {resetting.user.name}?</h2>
		<form {...f.enhance(closeWhenDone(() => resetDialog, true))} class="stack">
			<input {...f.fields.id.as('hidden', resetting.user.id)} />
			<p>
				{resetting.user.name} bekommt ein neues einmaliges Passwort. Das alte gilt nicht mehr, und alle Anmeldungen
				enden sofort. Das neue Passwort siehst du danach nur einmal.
			</p>
			{#each f.fields.allIssues() ?? [] as issue (issue.message)}<p class="error" role="alert">{issue.message}</p>{/each}
			<div class="row buttons">
				<button type="button" class="btn" onclick={() => resetDialog.close()}>Abbrechen</button>
				<button type="submit" class="btn primary">Neues Passwort erzeugen</button>
			</div>
		</form>
	{/if}
</dialog>

<!-- deactivate -->
<dialog bind:this={leaveDialog} onclose={() => (leaving = undefined)} aria-labelledby="leave-title">
	{#if leaving}
		{@const f = deactivatePerson.for(leaving.user.id)}
		<h2 id="leave-title">{leaving.user.name} deaktivieren?</h2>
		<form {...f.enhance(closeWhenDone(() => leaveDialog))} class="stack">
			<input {...f.fields.id.as('hidden', leaving.user.id)} />
			<p>
				{leaving.user.name} kann sich nicht mehr anmelden. Die Einträge und die Historie bleiben erhalten.
				Offene Anträge werden storniert.
			</p>
			<p class="note">Wir löschen nichts. Alles bleibt in der Historie.</p>
			{#each f.fields.allIssues() ?? [] as issue (issue.message)}<p class="error" role="alert">{issue.message}</p>{/each}
			<div class="row buttons">
				<button type="button" class="btn" onclick={() => leaveDialog.close()}>Abbrechen</button>
				<button type="submit" class="btn dark">Deaktivieren</button>
			</div>
		</form>
	{/if}
</dialog>

<style>
	.bar {
		display: flex;
		flex-wrap: wrap;
		gap: 16px;
		align-items: flex-end;
		justify-content: space-between;
	}
	.search {
		flex: 1 1 280px;
		max-width: 420px;
	}
	.once {
		max-width: 560px;
	}
	.once p {
		margin: 0 0 12px;
	}
	.password {
		font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
		font-size: 17px;
		font-weight: 700;
		background: #fff;
		padding: 8px 14px;
		border-radius: 10px;
		user-select: all;
	}
	.small {
		font-size: 13px;
		margin: 0;
	}

	.people {
		list-style: none;
		margin: 6px 0 0;
		padding: 0;
	}
	.people li {
		display: grid;
		grid-template-columns: 40px minmax(110px, 1.4fr) 130px minmax(90px, 1fr) 80px 90px max-content;
		gap: 14px;
		align-items: center;
		padding: 14px 0;
		border-bottom: 1px solid var(--line-soft);
	}
	.people li.off {
		opacity: 0.62;
	}
	.none {
		display: block;
		padding: 18px 0;
	}
	.who {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.who small {
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.role {
		font-weight: 700;
		font-size: 14px;
	}
	.lead {
		font-size: 14px;
	}
	.allow {
		font-weight: 800;
	}
	.actions {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 2px;
	}
	.link {
		border: 0;
		background: none;
		padding: 0;
		font: inherit;
		font-size: 14px;
		color: var(--blue);
		text-decoration: underline;
		cursor: pointer;
		white-space: nowrap;
	}

	/* the soft painted washes behind words and initials */
	.ini,
	.chip,
	.tag {
		position: relative;
		isolation: isolate;
		font-weight: 800;
	}
	.ini {
		width: 38px;
		height: 38px;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 12px;
		color: var(--text);
	}
	.ini::before,
	.chip::before,
	.tag::before {
		content: '';
		position: absolute;
		inset: 0;
		z-index: -1;
		background: var(--wash);
		filter: var(--paint);
	}
	.ini::before {
		border-radius: 999px;
	}
	.chip,
	.tag {
		display: inline-block;
		padding: 3px 12px;
		font-size: 13px;
	}
	.chip::before,
	.tag::before {
		border-radius: 10px;
	}
	.sky {
		--wash: var(--sky);
	}
	.green,
	.on {
		--wash: var(--ok-bg);
		color: var(--ok-ink);
	}
	.honey,
	.tag {
		--wash: var(--wait-bg);
		color: var(--wait-ink);
	}
	.gone {
		--wash: #e4dcd0;
		color: #4a3f39;
	}
	.sticky p {
		margin: 8px 0 0;
	}

	.stack {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	.stack p {
		margin: 0;
	}
	.buttons {
		justify-content: flex-end;
	}

	/* The side note takes room, so the compact row starts earlier than the window width suggests. */
	@media (max-width: 1180px) {
		.people li {
			grid-template-columns: 40px minmax(0, 1fr) auto;
		}
		.role,
		.lead,
		.allow {
			display: none;
		}
		.actions {
			grid-column: 2 / -1;
			flex-direction: row;
			flex-wrap: wrap;
			gap: 4px 18px;
		}
	}
</style>
