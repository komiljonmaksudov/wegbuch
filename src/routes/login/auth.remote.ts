import { invalid, redirect } from '@sveltejs/kit';
import { form, getRequestEvent, query } from '$app/server';
import { auth, throttle, DEMO, DEMO_PASSWORD, demoEmail } from '#lib/server/app';
import { SESSION_COOKIE } from '#core/constants';
import { startSession } from '#lib/server/session';
import * as v from 'valibot';

/** Demo accounts, one per role, so the review can switch roles with one click. Only in demo mode. */
export const getDemoAccounts = query(async () => {
	if (!DEMO) return [];
	return ['anna', 'markus', 'sabine'].map((id) => ({
		id,
		email: demoEmail(id),
		name: auth.getUser(id)?.name ?? id,
		password: DEMO_PASSWORD
	}));
});

// The password field starts with an underscore: SvelteKit never sends it back to the browser.
export const login = form(
	v.object({
		email: v.pipe(v.string(), v.trim(), v.nonEmpty(), v.maxLength(200)),
		_password: v.pipe(v.string(), v.nonEmpty(), v.maxLength(200))
	}),
	async ({ email, _password }) => {
		const { cookies } = getRequestEvent();
		if (throttle.isBlocked(email)) invalid('Zu viele Versuche. Bitte warte einige Minuten.');

		const user = auth.checkLogin(email, _password);
		if (!user) {
			throttle.recordFailure(email);
			// Same message for a wrong password and an unknown email.
			invalid('E-Mail oder Passwort stimmt nicht.');
		}

		throttle.reset(email);
		startSession(cookies, user.id);
		// A successful form refreshes every query on the page by default. Here that would re-run the old page's
		// queries during the hand-over and flash an error. Refreshing one public query replaces that default.
		void getDemoAccounts().refresh();
		redirect(303, '/');
	}
);

// A form, so a link or an image cannot log someone out. SvelteKit checks the origin of form posts.
export const logout = form(v.object({}), async () => {
	const { cookies } = getRequestEvent();
	auth.deleteSession(cookies.get(SESSION_COOKIE));
	cookies.delete(SESSION_COOKIE, { path: '/' });
	// Same reason as at login: the page we leave must not re-run its queries without a session.
	void getDemoAccounts().refresh();
	redirect(303, '/login');
});
