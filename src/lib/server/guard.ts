// Every load and every action checks for itself. A layout's check does not cover form actions.

import { error, redirect } from '@sveltejs/kit';
import { getRequestEvent } from '$app/server';
import type { Role, User } from './auth';

export function requireUser(locals: App.Locals): User {
	if (!locals.user) redirect(303, '/login');
	return locals.user;
}

export function requireRole(locals: App.Locals, ...roles: Role[]): User {
	const user = requireUser(locals);
	if (!roles.includes(user.role)) error(403, 'Dazu fehlt dir die Berechtigung.');
	return user;
}

// The same checks for remote functions. They cannot redirect, so a missing login is a 401.
export function currentUser(): User {
	const { locals } = getRequestEvent();
	if (!locals.user) error(401, 'Bitte melde dich an.');
	return locals.user;
}

export function currentRole(...roles: Role[]): User {
	const user = currentUser();
	if (!roles.includes(user.role)) error(403, 'Dazu fehlt dir die Berechtigung.');
	return user;
}
