import { invalid, redirect } from '@sveltejs/kit';
import * as v from 'valibot';
import { form, query } from '$app/server';
import { addDays } from '#core/rules-de-nrw';
import { commands } from '#lib/server/app';
import { currentUser } from '#lib/server/guard';

export const getSickScreen = query(async () => {
	currentUser();
	const today = commands.today();
	return { today, yesterday: addDays(today, -1) };
});

export const reportSick = form(
	v.object({
		since: v.picklist(['today', 'yesterday', 'other']),
		date: v.optional(v.pipe(v.string(), v.maxLength(10)), ''),
		until: v.optional(v.pipe(v.string(), v.maxLength(10)), ''),
		// One id per opened page: a double click or a retry sends the same id and changes nothing.
		commandId: v.pipe(v.string(), v.nonEmpty('Bitte lade die Seite neu.'), v.maxLength(100))
	}),
	async ({ since, date, until, commandId }) => {
		const today = commands.today();
		const from = since === 'today' ? today : since === 'yesterday' ? addDays(today, -1) : date;
		const to = until || from; // "bis" is optional: without it the note covers one day
		const result = commands.reportSick(currentUser(), commandId, { from, to });
		if (!result.ok) invalid(result.error.message);
		redirect(303, '/');
	}
);
