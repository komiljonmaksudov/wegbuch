import { error } from '@sveltejs/kit';
import { getRequestEvent, query } from '$app/server';
import { live } from '#lib/server/app';

/**
 * Counters of what changed (see live.ts). The browser keeps one connection open and reloads
 * only the parts whose counter moved. Only for a logged-in person, checked here like everywhere.
 */
export const changes = query.live(async function* () {
	const { locals, request } = getRequestEvent();
	if (!locals.user) error(401, 'Bitte melde dich an.');
	yield* live.stream(locals.user.id, request.signal);
});
