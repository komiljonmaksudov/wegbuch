import { invalid } from '@sveltejs/kit';
import * as v from 'valibot';
import { form, query } from '$app/server';
import { auth, live, people } from '#lib/server/app';
import { currentRole } from '#lib/server/guard';

/** The list for HR, with everyone including deactivated people, and the leads to choose from. */
export const getPeople = query(async () => {
	const me = currentRole('hr');
	return {
		me: me.id,
		people: people.list(),
		leads: auth.listUsers().filter((u) => u.role === 'lead').map((u) => ({ id: u.id, name: u.name }))
	};
});

const id = v.pipe(v.string(), v.nonEmpty(), v.maxLength(100));
// Only the shape is checked here. The rules (e-mail format, a lead for employees) live in People.
const person = {
	name: v.pipe(v.string(), v.trim(), v.maxLength(100)),
	email: v.pipe(v.string(), v.trim(), v.maxLength(200)),
	role: v.picklist(['employee', 'lead', 'hr']),
	managerId: v.optional(v.pipe(v.string(), v.maxLength(100)), ''),
	allowance: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(60))
};
const readPerson = (d: { name: string; email: string; role: 'employee' | 'lead' | 'hr'; managerId: string; allowance: number }) => ({
	...d,
	managerId: d.managerId || null
});

// Every function checks the role again. A page's own check does not cover them.
export const addPerson = form(v.object(person), async (data) => {
	const result = people.add(currentRole('hr'), readPerson(data));
	if (!result.ok) invalid(result.error.message);
	live.bumpPeople();
	// The password is shown once, right here. It is not stored in plain text anywhere.
	return { kind: 'added' as const, name: result.value.user.name, email: result.value.user.email, password: result.value.password };
});

export const updatePerson = form(v.object({ id, ...person }), async ({ id, ...data }) => {
	const result = people.update(currentRole('hr'), id, readPerson(data));
	if (!result.ok) invalid(result.error.message);
	live.bumpPeople();
});

// A forgotten password: HR gives a new one-time password. The person's old logins end at once.
export const resetPassword = form(v.object({ id }), async ({ id }) => {
	const result = people.resetPassword(currentRole('hr'), id);
	if (!result.ok) invalid(result.error.message);
	live.bumpPeople();
	return { kind: 'reset' as const, name: result.value.user.name, email: result.value.user.email, password: result.value.password };
});

export const deactivatePerson = form(v.object({ id }), async ({ id }) => {
	const result = people.setActive(currentRole('hr'), id, false);
	if (!result.ok) invalid(result.error.message);
	live.bumpPeople();
});

export const reactivatePerson = form(v.object({ id }), async ({ id }) => {
	const result = people.setActive(currentRole('hr'), id, true);
	if (!result.ok) invalid(result.error.message);
	live.bumpPeople();
});
