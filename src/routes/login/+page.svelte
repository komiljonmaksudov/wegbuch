<script lang="ts">
	import { getDemoAccounts, login } from './auth.remote';

	// Awaited in the script, not in an {#await} block: while a query refreshes, Svelte keeps the old value on screen.
	// A block would remove the demo box for a moment each time (a flicker right after clicking a demo account).
	const accounts = $derived(await getDemoAccounts());
</script>

<div class="wrap">
	<div class="rings" aria-hidden="true">
		{#each Array.from({ length: 8 }, (_, i) => i) as i (i)}<span></span>{/each}
	</div>
	<main>
		<h1>Anmelden</h1>

		<form {...login} class="stack">
			<label class="field">
				E-Mail
				<input {...login.fields.email.as('email')} autocomplete="username" required />
			</label>
			<label class="field">
				Passwort
				<input {...login.fields._password.as('password')} autocomplete="current-password" required />
			</label>
			{#each login.fields.allIssues() ?? [] as issue (issue.message)}
				<p role="alert" class="error">{issue.message}</p>
			{/each}
			<div><button type="submit" class="btn primary">Anmelden</button></div>
		</form>

			{#if accounts.length > 0}
				<section class="sticky yellow demo">
					<h2 class="label">Demo-Konten</h2>
					<p>Ein Konto pro Rolle. Nur für die Vorführung.</p>
					<div class="accounts">
						{#each accounts as account (account.id)}
							{@const demo = login.for(account.id)}
							<form {...demo}>
								<input {...demo.fields.email.as('hidden', account.email)} />
								<input {...demo.fields._password.as('hidden', account.password)} />
								<button type="submit" class="btn small">{account.name}</button>
							</form>
						{/each}
					</div>
				</section>
			{/if}
	</main>
</div>

<style>
	.wrap {
		max-width: 520px;
		margin: 56px auto;
		padding: 0 16px;
	}
	.rings {
		position: relative;
		z-index: 2;
		display: flex;
		justify-content: space-between;
		padding: 0 40px;
		margin-bottom: -18px;
	}
	.rings span {
		width: 12px;
		height: 38px;
		border-radius: 8px;
		background: #b8707a;
		box-shadow:
			inset -3px 0 0 #8e4e58,
			0 3px 3px rgba(59, 47, 42, 0.18);
	}
	main {
		background: var(--sheet);
		border-radius: 6px;
		box-shadow: 0 22px 50px rgba(59, 47, 42, 0.12);
		padding: 52px 44px 44px;
		display: flex;
		flex-direction: column;
		gap: 28px;
	}
	.stack {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	.stack p {
		margin: 0;
	}
	.demo p {
		margin: 0 0 12px;
	}
	.accounts {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
	}
</style>
