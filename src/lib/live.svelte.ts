// What the server last said changed (see server/live.ts). The layout writes it, pages read it.
import { untrack } from 'svelte';

export type Topic = 'calendar' | 'approvals' | 'mine' | 'history' | 'people';

export const live = $state<Partial<Record<Topic, number>>>({});

/** Calls `reload` when the counter of `topic` moves. The first value is only remembered, never a reason to reload. */
export function reloadOn(topic: Topic, reload: () => unknown) {
	let seen = live[topic];
	$effect(() => {
		const now = live[topic];
		if (seen !== undefined && now !== seen) untrack(reload);
		seen = now;
	});
}
