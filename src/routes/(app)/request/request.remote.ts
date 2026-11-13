import { invalid, redirect } from '@sveltejs/kit';
import * as v from 'valibot';
import { form, query } from '$app/server';
import { commands, screens } from '#lib/server/app';
import { currentUser } from '#lib/server/guard';

/** What the request screen needs: the balance, who else is away, and my own open or approved requests. */
export const getRequestScreen = query(async () => {
	const user = currentUser();
	const balance = commands.balance(user.id);
	return {
		entitlement: balance.entitlement,
		free: balance.free,
		today: commands.today(),
		team: screens.teamAbsences(user),
		// Open and approved requests of mine: shown in the picker, and a new request may not overlap them.
		mine: balance.requests
			.filter((r) => r.status === 'open' || r.status === 'approved')
			.map((r) => ({ from: r.from, to: r.to, status: r.status as 'open' | 'approved' }))
	};
});

export const requestVacation = form(
	v.object({
		from: v.pipe(v.string(), v.maxLength(10)),
		to: v.pipe(v.string(), v.maxLength(10)),
		comment: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(500)), ''),
		// One id per opened page: a double click or a retry sends the same id and changes nothing.
		commandId: v.pipe(v.string(), v.nonEmpty('Bitte lade die Seite neu.'), v.maxLength(100))
	}),
	async ({ from, to, comment, commandId }) => {
		const result = commands.requestVacation(currentUser(), commandId, { from, to, comment });
		if (!result.ok) invalid(result.error.message);
		redirect(303, '/');
	}
);
