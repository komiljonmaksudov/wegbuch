<script lang="ts">
	import { onMount } from 'svelte';
	import { refreshAll } from '$app/navigation';
	import { live, reloadOn, type Topic } from '#lib/live.svelte';
	import { changes } from './live.remote';
	import { getOpenApprovals } from './me.remote';
	import { logout } from '../login/auth.remote';
	import { page } from '$app/state';
	import { initials } from '#lib/format';

	let { data, children } = $props();

	// The avatar menu. It closes on Escape, on a click elsewhere, and when you go to another page.
	let menuOpen = $state(false);
	$effect(() => {
		page.url.pathname;
		menuOpen = false;
	});

	// Live updates. The server sends counters of what changed, never data. They go into one shared store.
	// Each page reloads its own queries when its counter moves (reloadOn), and checks your rights as always.
	const stream = changes();
	$effect(() => {
		const now = stream.current;
		if (!now) return;
		for (const [kind, count] of Object.entries(now)) live[kind as Topic] = count;
	});

	const openApprovals = $derived(await getOpenApprovals());
	reloadOn('approvals', () => getOpenApprovals().refresh());
	// HR changed a name, role or team lead: the header and the profile show the new values.
	reloadOn('people', () => refreshAll());

	// A backup for when the connection was away: reload everything when you come back to the tab.
	onMount(() => {
		const onVisible = () => {
			if (document.visibilityState === 'visible') refreshAll();
		};
		document.addEventListener('visibilitychange', onVisible);
		return () => document.removeEventListener('visibilitychange', onVisible);
	});

	const roles = { employee: 'Mitarbeiter:in', lead: 'Teamleitung', hr: 'HR' } as const;
	// A colour per section, like the sketchbook: sky for me, green for approvals, honey for HR.
	const roleTone = { employee: 'sky', lead: 'green', hr: 'honey' } as const;

	const links = $derived([
		{ href: '/', label: 'Mein Urlaub', tone: 'sky', badge: 0 },
		{ href: '/calendar', label: 'Teamkalender', tone: 'sky', badge: 0 },
		...(data.user.role !== 'employee'
			? [{ href: '/approvals', label: 'Freigaben', tone: 'green', badge: openApprovals }]
			: []),
		...(data.user.role === 'hr' ? [{ href: '/history', label: 'Historie', tone: 'honey', badge: 0 }] : []),
		...(data.user.role === 'hr' ? [{ href: '/people', label: 'Mitarbeiter', tone: 'honey', badge: 0 }] : []),
	]);

	// The one h1 of each page lives here, left of the nav, like in the design.
	const titles: Record<string, string> = {
		'/': 'Mein Urlaub',
		'/request': 'Urlaub beantragen',
		'/sick': 'Krank melden',
		'/calendar': 'Teamkalender',
		'/approvals': 'Freigaben',
		'/history': 'Historie',
		'/people': 'Mitarbeiter',
		'/profile': 'Mein Profil',
		'/coming-soon': 'Bald verfügbar'
	};
	const title = $derived(titles[page.url.pathname] ?? 'Abwesenheiten');
	// The request and sick forms are small flows: a way back, no nav.
	const focused = $derived(['/request', '/sick'].includes(page.url.pathname));

	const isCurrent = (href: string) =>
		href === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(href);
</script>

<svelte:head>
	<title>{title} · Wegbuch</title>
</svelte:head>

<svelte:window
	onkeydown={(e) => e.key === 'Escape' && (menuOpen = false)}
	onclick={(e) => {
		if (menuOpen && !(e.target as Element).closest('.menuwrap')) menuOpen = false;
	}}
/>

<div class="shell">
	<div class="rings" aria-hidden="true">
		{#each Array.from({ length: 18 }, (_, i) => i) as i (i)}<span></span>{/each}
	</div>

	<div class="sheet">
		<header>
			<div class="titlebox">
				{#if focused}<a class="back" href="/">← Zurück zu Mein Urlaub</a>{/if}
				<h1>{title}</h1>
			</div>
			{#if !focused}
				<div class="right">
					<nav aria-label="Hauptnavigation">
						{#each links as link (link.href)}
							<a href={link.href} class="tone-{link.tone}" aria-current={isCurrent(link.href) ? 'page' : undefined}>
								{link.label}{#if link.badge > 0}<span aria-hidden="true">&nbsp;·&nbsp;{link.badge}</span><span class="sr">, {link.badge} offen</span>{/if}
							</a>
						{/each}
					</nav>
					<div class="who tone-{roleTone[data.user.role]}">
						<span class="col meta">
							<strong>{data.user.name}</strong>
							<span class="role">{roles[data.user.role]}</span>
						</span>
						<div class="menuwrap">
							<button
								type="button"
								class="avatar"
								aria-haspopup="menu"
								aria-expanded={menuOpen}
								aria-label="Menü für {data.user.name}"
								onclick={() => (menuOpen = !menuOpen)}
							>
								{initials(data.user.name)}
							</button>
							{#if menuOpen}
								<div class="menu" role="menu">
									<p class="menu-name"><strong>{data.user.name}</strong><span>{roles[data.user.role]}</span></p>
									<a role="menuitem" href="/profile" aria-current={page.url.pathname === '/profile' ? 'page' : undefined}>Mein Profil</a>
									<form {...logout}><button type="submit" role="menuitem">Abmelden</button></form>
								</div>
							{/if}
						</div>
					</div>
				</div>
			{/if}
		</header>

		<main>
			<!-- Only `failed`, no `pending`: a pending boundary would make the server send just a placeholder. -->
			<svelte:boundary>
				{@render children()}
				{#snippet failed(error, reset)}
					<section class="sticky yellow broke" role="alert">
						<h2 class="label">Das hat nicht geklappt</h2>
						<p>{(error as { message?: string })?.message ?? 'Bitte versuche es noch einmal.'}</p>
						<div class="row">
							<button type="button" class="btn small" onclick={reset}>Noch einmal versuchen</button>
							<a class="btn small" href="/login">Neu anmelden</a>
						</div>
					</section>
				{/snippet}
			</svelte:boundary>
		</main>
	</div>
</div>

<style>
	.shell {
		max-width: 1240px;
		margin: 0 auto;
		padding: 40px 24px 64px;
	}
	.rings {
		position: relative;
		z-index: 2;
		display: flex;
		justify-content: space-between;
		padding: 0 48px;
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
	.sheet {
		background: var(--sheet);
		border-radius: 6px;
		box-shadow: 0 22px 50px rgba(59, 47, 42, 0.12);
		padding: 52px 56px 56px;
		display: flex;
		flex-direction: column;
		gap: 32px;
	}
	header {
		position: relative;
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		justify-content: space-between;
		gap: 16px 24px;
	}
	.titlebox {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.back {
		font-size: 13px;
		font-weight: 800;
		color: var(--text);
		text-decoration: none;
	}
	/* Grows to the full row when it drops under the title: links on the left, you on the right. */
	.right {
		display: flex;
		flex: 1 1 auto;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 12px 24px;
	}
	nav {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
	}
	nav a {
		position: relative;
		isolation: isolate;
		padding: 8px 18px;
		font-weight: 700;
		color: var(--muted);
		text-decoration: none;
	}
	nav a[aria-current='page'] {
		font-weight: 800;
		color: var(--ink);
	}
	nav a[aria-current='page']::before {
		content: '';
		position: absolute;
		inset: 0;
		z-index: -1;
		background: var(--wash);
		border-radius: 14px;
		filter: var(--paint);
	}
	.tone-sky {
		--wash: var(--sky);
		--ink: var(--blue-ink);
	}
	.tone-green {
		--wash: var(--ok-bg);
		--ink: var(--ok-ink);
	}
	.tone-honey {
		--wash: var(--wait-bg);
		--ink: var(--wait-ink);
	}
	.who {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.avatar {
		position: relative;
		isolation: isolate;
		width: 38px;
		height: 38px;
		display: flex;
		align-items: center;
		justify-content: center;
		border: 0;
		background: none;
		padding: 0;
		font: inherit;
		font-weight: 800;
		font-size: 13px;
		color: var(--ink);
		cursor: pointer;
	}
	.avatar::before {
		content: '';
		position: absolute;
		inset: 0;
		z-index: -1;
		border-radius: 999px;
		background: var(--wash);
		filter: var(--paint);
	}
	.col {
		display: flex;
		flex-direction: column;
		line-height: 1.25;
	}
	.meta {
		align-items: flex-end;
	}
	.role {
		font-size: 14px;
		color: var(--muted);
	}
	.menuwrap {
		position: relative;
	}
	.menu {
		position: absolute;
		right: 0;
		top: 52px;
		z-index: 5;
		width: 200px;
		display: flex;
		flex-direction: column;
		padding: 8px;
		background: #fff;
		border-radius: 10px;
		box-shadow: 0 12px 26px rgba(59, 47, 42, 0.18);
	}
	.menu a,
	.menu button {
		display: block;
		width: 100%;
		padding: 10px 12px;
		border: 0;
		border-radius: 8px;
		background: none;
		font: inherit;
		font-weight: 700;
		color: var(--text);
		text-align: left;
		text-decoration: none;
		cursor: pointer;
	}
	.menu a[aria-current='page'] {
		background: var(--weekend);
		font-weight: 800;
	}
	.menu a:hover,
	.menu button:hover {
		background: var(--weekend);
	}
	main {
		min-width: 0;
	}
	.broke {
		max-width: 520px;
	}
	.broke p {
		margin: 0 0 16px;
	}
	.broke .row {
		display: flex;
		gap: 12px;
		flex-wrap: wrap;
	}
	.menu-name {
		display: none;
		margin: 0 0 6px;
		padding: 8px 12px 10px;
		border-bottom: 1px solid var(--line-soft);
		flex-direction: column;
		line-height: 1.3;
	}
	.menu-name span {
		font-size: 14px;
		color: var(--muted);
	}
	@media (max-width: 760px) {
		/* Phone header: the title on the left, the avatar on the right, the links in one swipeable row. */
		.titlebox {
			padding-right: 56px;
		}
		.right {
			flex: 1 1 100%;
			flex-direction: column;
			align-items: stretch;
			gap: 0;
		}
		/* The links wrap into two compact rows. Nothing is hidden behind a sideways swipe. */
		nav {
			flex-wrap: wrap;
			gap: 2px 2px;
		}
		nav a {
			white-space: nowrap;
			padding: 7px 12px;
			font-size: 15px;
		}
		.who {
			position: absolute;
			top: 0;
			right: 0;
		}
		.meta {
			display: none;
		}
		.menu-name {
			display: flex;
		}
		.shell {
			padding: 24px 12px 40px;
		}
		.sheet {
			padding: 36px 20px 32px;
		}
		.rings {
			padding: 0 20px;
		}
	}
</style>
