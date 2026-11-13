import { invalid } from '@sveltejs/kit';
import * as v from 'valibot';
import { form, query } from '$app/server';
import { commands, screens } from '#lib/server/app';
import { currentUser } from '#lib/server/guard';

/** Balance, entries and holidays of the signed-in person ("Mein Urlaub"). */
export const getOverview = query(async () => screens.overview(currentUser()));

export const cancelRequest = form(v.object({ requestId: v.pipe(v.string(), v.nonEmpty(), v.maxLength(200)) }), async ({ requestId }) => {
	const user = currentUser();
	// A fixed command id per request: clicking twice cancels once.
	const result = commands.cancel(user, `cancel-${requestId}`, { requestId });
	if (!result.ok) invalid(result.error.message);
});
