import * as v from 'valibot';
import { query } from '$app/server';
import { commands, screens } from '#lib/server/app';
import { currentUser } from '#lib/server/guard';

const shift = (year: number, month: number, by: number) => {
	const d = new Date(Date.UTC(year, month - 1 + by, 1));
	return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};

/** One month of the team calendar. `m` is "2026-12" and `view` is "hr". Anything else falls back to the safe default. */
export const getCalendar = query(
	v.object({ m: v.optional(v.pipe(v.string(), v.maxLength(10))), view: v.optional(v.pipe(v.string(), v.maxLength(10))) }),
	async ({ m = '', view }) => {
		const user = currentUser();
		const today = commands.today();

		const valid = /^(20\d\d)-(0[1-9]|1[0-2])$/.test(m);
		const year = valid ? Number(m.slice(0, 4)) : Number(today.slice(0, 4));
		const month = valid ? Number(m.slice(5, 7)) : Number(today.slice(5, 7));

		// Only HR can switch to the HR view. For everyone else the flag is ignored on the server.
		const hrView = user.role === 'hr' && view === 'hr';

		return {
			...screens.calendar(user, year, month, hrView),
			year,
			month,
			today,
			prev: shift(year, month, -1),
			next: shift(year, month, 1),
			canSwitch: user.role === 'hr'
		};
	}
);

