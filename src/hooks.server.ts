import type { Handle, HandleServerError } from '@sveltejs/kit/hooks';
import { auth } from '#lib/server/app';
import { SESSION_COOKIE } from '#core/constants';

export const handle: Handle = async ({ event, resolve }) => {
	const token = event.cookies.get(SESSION_COOKIE);
	event.locals.user = auth.validateSession(token);
	// An invalid or expired cookie is removed, so the browser stops sending it.
	if (token && !event.locals.user) event.cookies.delete(SESSION_COOKIE, { path: '/' });

	// Fonts get a <link rel="preload"> too (default: only scripts and styles), so the browser fetches them at once
	// and not after it has read the CSS. That is what removes the jump from fallback text to the real font.
	const response = await resolve(event, {
		preload: ({ type }) => type === 'js' || type === 'css' || type === 'font'
	});

	// Browsers must not guess file types, must not show our pages inside another site's frame
	// (a hidden Approve button), and must not tell other sites which page you came from.
	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('Content-Security-Policy', "frame-ancestors 'none'");
	response.headers.set('X-Frame-Options', 'DENY');
	response.headers.set('Referrer-Policy', 'same-origin');
	// Private pages and the login must not be kept in the browser cache: the back button on a shared
	// computer would show them after logout. (Static files do not pass through here, so they stay cached.)
	if (event.locals.user || event.url.pathname === '/login') response.headers.set('Cache-Control', 'no-store');
	return response;
};

// Every error passes here. Our own errors (error(404, '…')) and framework errors (a 404) are safe to show.
// Anything else may hold details we must not show, so people get a plain message and the log gets the real one.
export const handleError: HandleServerError = ({ kind, error, event }) => {
	if (kind === 'app' || kind === 'framework') return error;
	const id = crypto.randomUUID().slice(0, 8);
	console.error(`[${id}] ${kind} error on ${event.request.method} ${event.url.pathname}`, error);
	return { message: `Da ist etwas schiefgelaufen. Fehlernummer: ${id}` };
};
