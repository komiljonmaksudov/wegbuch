<script lang="ts">
	import { initials } from '#lib/format';
	import { getManagerName } from '../me.remote';
	import { changePassword } from './profile.remote';

	let { data } = $props();

	// The layout holds the user. This page reads it from the parent data.
	const roleName = { employee: 'Mitarbeiter:in', lead: 'Teamleitung', hr: 'HR' } as const;
	const me = $derived(data.user);
	const managerName = $derived(await getManagerName());

	let dialog: HTMLDialogElement;

	// The dialog stays open while there is an error to read. It closes when the change worked.
	const closeWhenDone = async (f: { submit: () => Promise<boolean>; element: HTMLFormElement }) => {
		try {
			if (await f.submit()) {
				f.element.reset();
				dialog.close();
			}
		} catch {
			// the error shows in the dialog
		}
	};
</script>

<div class="page">
	<div class="layout">
		<div class="photo">
			<span class="big" aria-hidden="true">{initials(me.name)}</span>
		</div>

		<div class="facts">
			<dl>
				<div><dt>Name</dt><dd>{me.name}</dd></div>
				<div><dt>E-Mail</dt><dd>{me.email}</dd></div>
				<div>
					<dt>Rolle</dt>
					<dd>{roleName[me.role]}{managerName ? ` · Teamleitung ${managerName}` : ''}</dd>
				</div>
				<div class="row-pw">
					<dt>Passwort</dt>
					<dd>
						<button type="button" class="link" onclick={() => dialog.showModal()}>Passwort ändern</button>
						{#if changePassword.result?.changed}<span class="ok" role="status">Gespeichert. Alle anderen Anmeldungen sind beendet.</span>{/if}
					</dd>
				</div>
			</dl>
			<p class="muted small">Name, E-Mail und Rolle pflegt HR.</p>

			<section class="sticky yellow">
				<p>Wähle ein langes Passwort, am besten einen ganzen Satz. Nur du kennst es. Wir speichern nur einen Fingerabdruck davon.</p>
			</section>
		</div>
	</div>
</div>

<dialog bind:this={dialog} aria-labelledby="pw-title">
	<h2 id="pw-title">Passwort ändern</h2>
	<form {...changePassword.enhance(closeWhenDone)} class="stack">
		<label class="field">
			Aktuelles Passwort
			<input class="line" {...changePassword.fields._current.as('password')} autocomplete="current-password" required />
		</label>
		<label class="field">
			Neues Passwort (mindestens 10 Zeichen)
			<input class="line" {...changePassword.fields._next.as('password')} autocomplete="new-password" minlength="10" maxlength="200" required />
		</label>
		<label class="field">
			Neues Passwort noch einmal
			<input class="line" {...changePassword.fields._again.as('password')} autocomplete="new-password" minlength="10" maxlength="200" required />
		</label>
		{#each changePassword.fields.allIssues() ?? [] as issue (issue.message)}<p class="error" role="alert">{issue.message}</p>{/each}
		<div class="row buttons">
			<button type="button" class="btn" onclick={() => dialog.close()}>Abbrechen</button>
			<button type="submit" class="btn primary">Speichern</button>
		</div>
	</form>
</dialog>

<style>
	.layout {
		display: flex;
		flex-wrap: wrap;
		gap: 40px 56px;
		align-items: flex-start;
	}
	.photo {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 14px;
	}
	.big {
		position: relative;
		isolation: isolate;
		width: 160px;
		height: 160px;
		display: flex;
		align-items: center;
		justify-content: center;
		font-family: Caveat, cursive;
		font-weight: 700;
		font-size: 64px;
		color: var(--blue-ink);
	}
	.big::before {
		content: '';
		position: absolute;
		inset: 0;
		z-index: -1;
		border-radius: 999px;
		background: var(--sky);
		filter: var(--paint-big);
		clip-path: var(--torn);
	}
	.tag {
		position: relative;
		isolation: isolate;
		padding: 2px 12px;
		font-size: 13px;
		font-weight: 800;
		color: var(--wait-ink);
	}
	.tag::before {
		content: '';
		position: absolute;
		inset: 0;
		z-index: -1;
		border-radius: 10px;
		background: var(--wait-bg);
		filter: var(--paint);
	}
	.facts {
		flex: 1 1 420px;
		min-width: 0;
		display: flex;
		flex-direction: column;
	}
	dl {
		margin: 0;
	}
	dl > div {
		display: grid;
		grid-template-columns: 150px minmax(0, 1fr);
		gap: 12px;
		padding: 14px 0;
		border-bottom: 1px solid var(--line-soft);
	}
	dt {
		font-weight: 800;
		color: var(--muted);
	}
	dd {
		margin: 0;
		font-size: 18px;
		font-weight: 700;
	}
	.row-pw dd {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 10px 16px;
	}
	.link {
		border: 0;
		background: none;
		padding: 0;
		font: inherit;
		font-size: 17px;
		font-weight: 800;
		color: var(--blue);
		text-decoration: underline;
		cursor: pointer;
	}
	.ok {
		font-size: 14px;
		font-weight: 700;
		color: var(--ok-ink);
	}
	.small {
		margin: 10px 0 0;
		font-size: 14px;
	}
	.sticky {
		align-self: flex-start;
		margin-top: 34px;
		max-width: 420px;
		transform: rotate(-1.5deg);
	}
	.sticky p {
		margin: 0;
		font-size: 17px;
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
</style>
