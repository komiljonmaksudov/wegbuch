import { error } from '@sveltejs/kit';
import * as v from 'valibot';
import { query } from '$app/server';
import { auth, screens } from '#lib/server/app';
import { currentRole } from '#lib/server/guard';

/** Everyone HR may pick, and the full ledger of one person. Only HR. */
export const getHistory = query(v.object({ e: v.optional(v.pipe(v.string(), v.maxLength(100))) }), async ({ e }) => {
	const user = currentRole('hr');
	const people = auth.listUsers(true).map((u) => ({ id: u.id, name: u.name }));
	const employeeId = e || 'anna';
	const history = screens.history(user, employeeId);
	if (!history) error(404, 'Diese Person gibt es nicht.');
	return { people, employeeId, ...history };
});
