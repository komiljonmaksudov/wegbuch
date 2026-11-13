import { openDb } from './db';
import { describe, expect, it } from 'vitest';
import {
	Auth,
	LoginThrottle,
	hashPassword,
	verifyPassword
} from './auth';
import { SESSION_IDLE_MS, SESSION_MAX_MS } from '../../core/constants';

function setup() {
	let t = 1_000_000;
	const clock = { now: () => t, advance: (ms: number) => (t += ms) };
	const auth = new Auth(openDb(), clock.now);
	auth.addUser({
		id: 'anna',
		email: 'Anna@Example.test',
		name: 'Anna Weber',
		role: 'employee',
		managerId: null,
		password: 'demo1234'
	});
	return { auth, clock };
}

describe('passwords', () => {
	it('verifies the right password and rejects a wrong one', () => {
		const h = hashPassword('demo1234');
		expect(h.startsWith('$argon2id$v=19$m=19456,t=2,p=1$')).toBe(true);
		expect(verifyPassword('demo1234', h)).toBe(true);
		expect(verifyPassword('demo12345', h)).toBe(false);
	});

	it('uses a new salt each time', () => {
		expect(hashPassword('same')).not.toBe(hashPassword('same'));
	});

	it('rejects garbage instead of throwing', () => {
		expect(verifyPassword('x', 'not-a-hash')).toBe(false);
	});
});

describe('login', () => {
	it('accepts the right email (any case) and password', () => {
		const { auth } = setup();
		expect(auth.checkLogin('anna@example.test', 'demo1234')?.id).toBe('anna');
		expect(auth.checkLogin('  ANNA@example.test ', 'demo1234')?.id).toBe('anna');
	});

	it('rejects a wrong password and an unknown email the same way', () => {
		const { auth } = setup();
		expect(auth.checkLogin('anna@example.test', 'nope')).toBeUndefined();
		expect(auth.checkLogin('nobody@example.test', 'demo1234')).toBeUndefined();
	});

	it('never returns the password hash', () => {
		const { auth } = setup();
		expect(JSON.stringify(auth.checkLogin('anna@example.test', 'demo1234'))).not.toContain('argon2');
	});
});

describe('sessions', () => {
	it('a fresh token gives the user back', () => {
		const { auth } = setup();
		const token = auth.createSession('anna');
		expect(auth.validateSession(token)?.name).toBe('Anna Weber');
	});

	it('rejects a wrong secret, a malformed token and no token', () => {
		const { auth } = setup();
		const [id] = auth.createSession('anna').split('.');
		expect(auth.validateSession(`${id}.wrongsecret`)).toBeUndefined();
		expect(auth.validateSession('garbage')).toBeUndefined();
		expect(auth.validateSession(undefined)).toBeUndefined();
	});

	it('expires after the idle time', () => {
		const { auth, clock } = setup();
		const token = auth.createSession('anna');
		clock.advance(SESSION_IDLE_MS);
		expect(auth.validateSession(token)).toBeUndefined();
	});

	it('activity extends the session, but never past the absolute maximum', () => {
		const { auth, clock } = setup();
		const token = auth.createSession('anna');
		// Visit every 6 hours: idle never reached, so it stays valid...
		for (let i = 0; i < 3; i++) {
			clock.advance(6 * 60 * 60 * 1000);
			expect(auth.validateSession(token)).toBeDefined();
		}
		// ...until 24 hours after creation.
		clock.advance(SESSION_MAX_MS - 18 * 60 * 60 * 1000);
		expect(auth.validateSession(token)).toBeUndefined();
	});

	it('logout and "log out everywhere" end the session', () => {
		const { auth } = setup();
		const a = auth.createSession('anna');
		const b = auth.createSession('anna');
		auth.deleteSession(a);
		expect(auth.validateSession(a)).toBeUndefined();
		expect(auth.validateSession(b)).toBeDefined();
		auth.deleteAllSessions('anna');
		expect(auth.validateSession(b)).toBeUndefined();
	});
});

describe('LoginThrottle', () => {
	it('blocks after 5 failures and recovers after the window', () => {
		let t = 0;
		const throttle = new LoginThrottle(5, 1000, () => t);
		for (let i = 0; i < 5; i++) throttle.recordFailure('Anna@example.test');
		expect(throttle.isBlocked('anna@example.test')).toBe(true);
		t += 1001;
		expect(throttle.isBlocked('anna@example.test')).toBe(false);
	});

	it('a success resets the count', () => {
		const throttle = new LoginThrottle();
		for (let i = 0; i < 4; i++) throttle.recordFailure('a@x.test');
		throttle.reset('a@x.test');
		throttle.recordFailure('a@x.test');
		expect(throttle.isBlocked('a@x.test')).toBe(false);
	});
});

describe('changing a password', () => {
	it('the old password stops working, the new one works, and every old session ends', () => {
		const { auth } = setup();
		const here = auth.createSession('anna');
		const elsewhere = auth.createSession('anna');

		// What the profile page does: new password, all sessions end, this browser gets a new one.
		auth.setPassword('anna', 'a-new-long-password');
		auth.deleteAllSessions('anna');
		const renewed = auth.createSession('anna');

		expect(auth.checkLogin('anna@example.test', 'demo1234')).toBeUndefined();
		expect(auth.checkLogin('anna@example.test', 'a-new-long-password')?.id).toBe('anna');
		expect(auth.validateSession(here)).toBeUndefined(); // an old id can no longer be used, even this browser's
		expect(auth.validateSession(elsewhere)).toBeUndefined();
		expect(auth.validateSession(renewed)?.id).toBe('anna'); // only the new one works
	});
});
