import { invalid } from '@sveltejs/kit';
import * as v from 'valibot';
import { form, getRequestEvent } from '$app/server';
import { auth, throttle } from '#lib/server/app';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '#core/constants';
import { currentUser } from '#lib/server/guard';
import { startSession } from '#lib/server/session';

// Names start with an underscore: SvelteKit never sends these values back to the browser.
const password = v.pipe(v.string(), v.maxLength(PASSWORD_MAX_LENGTH, 'Das Passwort ist zu lang.'));

export const changePassword = form(
	v.object({ _current: password, _next: password, _again: password }),
	async ({ _current, _next, _again }, issue) => {
		const user = currentUser();

		// Asking for the current password stops a stolen session from taking over the account.
		// Wrong guesses count like wrong guesses at the login.
		if (throttle.isBlocked(user.email)) invalid('Zu viele Versuche. Bitte warte einige Minuten.');
		if (!auth.checkLogin(user.email, _current)) {
			throttle.recordFailure(user.email);
			invalid(issue._current('Das aktuelle Passwort stimmt nicht.'));
		}
		throttle.reset(user.email);

		if (_next.length < PASSWORD_MIN_LENGTH) invalid(issue._next(`Das neue Passwort braucht mindestens ${PASSWORD_MIN_LENGTH} Zeichen.`));
		if (_next === _current) invalid(issue._next('Das neue Passwort muss anders sein als das alte.'));
		if (_next !== _again) invalid(issue._again('Die beiden neuen Passwörter sind nicht gleich.'));

		auth.setPassword(user.id, _next);
		// OWASP: renew the session id after a password change. Every old login ends, this browser gets a new one.
		auth.deleteAllSessions(user.id);
		startSession(getRequestEvent().cookies, user.id);
		return { changed: true as const };
	}
);
