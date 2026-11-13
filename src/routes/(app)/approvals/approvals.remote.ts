import { invalid } from '@sveltejs/kit';
import * as v from 'valibot';
import { form, query } from '$app/server';
import { commands, screens } from '#lib/server/app';
import { currentRole } from '#lib/server/guard';

/** Open requests waiting for this lead or HR, and the ones decided lately. */
export const getPending = query(async () => screens.pending(currentRole('lead', 'hr')));

const id = v.pipe(v.string(), v.nonEmpty(), v.maxLength(200));

export const decide = form(
	v.object({
		employeeId: id,
		requestId: id,
		comment: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(500)), ''),
		decision: v.picklist(['approve', 'reject'])
	}),
	async ({ employeeId, requestId, comment, decision }) => {
		const user = currentRole('lead', 'hr');
		// A fixed command id per request: a double click decides once.
		const result = commands.decide(user, `decide-${requestId}`, {
			employeeId,
			requestId,
			approve: decision === 'approve',
			comment
		});
		if (!result.ok) invalid(result.error.message);
	}
);
