// The one place that sets the session cookie, so login and "new session after a password change" cannot differ.

import type { Cookies } from '@sveltejs/kit';
import { dev } from '$app/env';
import { auth } from './app';
import { SESSION_COOKIE, SESSION_MAX_MS } from '../../core/constants';

/** Makes a brand new session for the person and puts its cookie in the response. */
export function startSession(cookies: Cookies, userId: string): void {
	cookies.set(SESSION_COOKIE, auth.createSession(userId), {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: !dev, // the cookie only travels over HTTPS in production
		maxAge: SESSION_MAX_MS / 1000
	});
}
