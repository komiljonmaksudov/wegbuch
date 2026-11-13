// Users, passwords and sessions. Built on node:crypto only (no dependencies).
//
// Passwords: argon2id, stored as a PHC-style string so the cost can be raised later.
// Sessions (Lucia pattern): the cookie holds "<id>.<secret>". The database holds the id and
// SHA-256(secret), never the secret. A leaked database cannot be turned into valid cookies.

import type { Db } from './db';
import { argon2Sync, createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import {
	LOGIN_MAX_FAILURES,
	LOGIN_THROTTLE_MAX_KEYS,
	LOGIN_WINDOW_MS,
	PASSWORD_HASH,
	SESSION_IDLE_MS,
	SESSION_MAX_MS,
	SESSION_TOUCH_EVERY_MS
} from '../../core/constants';

// argon2 in node:crypto needs Node 24. Fail with a clear message, not "argon2Sync is not a function".
if (typeof argon2Sync !== 'function') {
	throw new Error(`Node 24 or newer is needed (this is ${process.version}). Run "nvm use" in the project folder.`);
}

export type Role = 'employee' | 'lead' | 'hr';

export type User = {
	id: string;
	email: string;
	name: string;
	role: Role;
	managerId: string | null;
	/** A deactivated person cannot log in and is left out of calendars and approvals. Their history stays. */
	active: boolean;
};

export function hashPassword(password: string): string {
	const salt = randomBytes(16);
	const tag = argon2Sync('argon2id', { message: password, nonce: salt, ...PASSWORD_HASH });
	const { memory: m, passes: t, parallelism: p } = PASSWORD_HASH;
	return `$argon2id$v=19$m=${m},t=${t},p=${p}$${salt.toString('base64')}$${tag.toString('base64')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
	const parts = stored.split('$'); // ['', 'argon2id', 'v=19', 'm=..,t=..,p=..', salt, tag]
	if (parts.length !== 6 || parts[1] !== 'argon2id') return false;
	const params = Object.fromEntries(parts[3].split(',').map((kv) => kv.split('=')));
	const expected = Buffer.from(parts[5], 'base64');
	const actual = argon2Sync('argon2id', {
		message: password,
		nonce: Buffer.from(parts[4], 'base64'),
		memory: Number(params.m),
		passes: Number(params.t),
		parallelism: Number(params.p),
		tagLength: expected.length
	});
	return timingSafeEqual(actual, expected);
}

// A hash to compare against when the email is unknown, so timing does not reveal which emails exist.
const DUMMY_HASH = hashPassword('not-a-real-password');

const sha256 = (s: string) => createHash('sha256').update(s).digest();

type UserRow = {
	id: string;
	email: string;
	name: string;
	role: Role;
	manager_id: string | null;
	password_hash: string;
	active: number;
};

const toUser = (r: UserRow): User => ({
	id: r.id,
	email: r.email,
	name: r.name,
	role: r.role,
	managerId: r.manager_id,
	active: r.active === 1
});

export class Auth {
	#db: Db;
	#now: () => number;

	constructor(db: Db, now: () => number = Date.now) {
		this.#now = now;
		this.#db = db;
		this.#db.exec(`
			CREATE TABLE IF NOT EXISTS users (
				id            TEXT PRIMARY KEY,
				email         TEXT NOT NULL UNIQUE,
				name          TEXT NOT NULL,
				role          TEXT NOT NULL CHECK (role IN ('employee', 'lead', 'hr')),
				manager_id    TEXT REFERENCES users(id),
				password_hash TEXT NOT NULL,
				active        INTEGER NOT NULL DEFAULT 1
			) STRICT;
			CREATE TABLE IF NOT EXISTS sessions (
				id           TEXT PRIMARY KEY,
				user_id      TEXT NOT NULL REFERENCES users(id),
				secret_hash  BLOB NOT NULL,
				created_at   INTEGER NOT NULL,
				last_seen_at INTEGER NOT NULL
			) STRICT;
		`);
		// A database made before "active" existed gets the column now.
		const columns = this.#db.prepare('PRAGMA table_info(users)').all() as { name: string }[];
		if (!columns.some((c) => c.name === 'active')) {
			this.#db.exec('ALTER TABLE users ADD COLUMN active INTEGER NOT NULL DEFAULT 1');
		}
	}

	// ---- users ----

	addUser(u: Omit<User, 'active'> & { password: string }): void {
		this.#db
			.prepare(
				'INSERT INTO users (id, email, name, role, manager_id, password_hash) VALUES (?, ?, ?, ?, ?, ?)'
			)
			.run(u.id, u.email.toLowerCase(), u.name, u.role, u.managerId, hashPassword(u.password));
	}

	userCount(): number {
		return (this.#db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }).n;
	}

	getUser(id: string): User | undefined {
		const row = this.#db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
		return row && toUser(row);
	}

	/** Active people only, unless you ask for everyone. Calendars and approvals never see the others. */
	listUsers(includeInactive = false): User[] {
		const sql = includeInactive
			? 'SELECT * FROM users ORDER BY name'
			: 'SELECT * FROM users WHERE active = 1 ORDER BY name';
		return (this.#db.prepare(sql).all() as UserRow[]).map(toUser);
	}

	updateUser(id: string, fields: { name: string; email: string; role: Role; managerId: string | null }): void {
		this.#db
			.prepare('UPDATE users SET name = ?, email = ?, role = ?, manager_id = ? WHERE id = ?')
			.run(fields.name, fields.email.trim().toLowerCase(), fields.role, fields.managerId, id);
	}

	/** Deactivating ends all of the person's sessions at once. */
	setActive(id: string, active: boolean): void {
		this.#db.prepare('UPDATE users SET active = ? WHERE id = ?').run(active ? 1 : 0, id);
		if (!active) this.deleteAllSessions(id);
	}

	/** Returns the user if email and password match and the person is active, otherwise undefined. */
	checkLogin(email: string, password: string): User | undefined {
		const row = this.#db
			.prepare('SELECT * FROM users WHERE email = ?')
			.get(email.trim().toLowerCase()) as UserRow | undefined;
		const ok = verifyPassword(password, row?.password_hash ?? DUMMY_HASH);
		return row && ok && row.active === 1 ? toUser(row) : undefined;
	}

	// ---- sessions ----

	/** Creates a session and returns the token for the cookie. */
	createSession(userId: string): string {
		const id = randomBytes(12).toString('base64url');
		const secret = randomBytes(32).toString('base64url');
		const now = this.#now();
		this.#db
			.prepare(
				'INSERT INTO sessions (id, user_id, secret_hash, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?)'
			)
			.run(id, userId, sha256(secret), now, now);
		return `${id}.${secret}`;
	}

	/** Returns the user for a valid token, or undefined. Renews "last seen" and deletes expired sessions. */
	validateSession(token: string | undefined): User | undefined {
		const parts = token?.split('.');
		if (!parts || parts.length !== 2) return undefined;
		const [id, secret] = parts;
		const s = this.#db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as
			| { user_id: string; secret_hash: Uint8Array; created_at: number; last_seen_at: number }
			| undefined;
		if (!s) return undefined;

		const now = this.#now();
		if (now - s.last_seen_at >= SESSION_IDLE_MS || now - s.created_at >= SESSION_MAX_MS) {
			this.#db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
			return undefined;
		}
		if (!timingSafeEqual(Buffer.from(s.secret_hash), sha256(secret))) return undefined;

		if (now - s.last_seen_at >= SESSION_TOUCH_EVERY_MS) {
			this.#db.prepare('UPDATE sessions SET last_seen_at = ? WHERE id = ?').run(now, id);
		}
		const user = this.getUser(s.user_id);
		if (!user?.active) {
			this.#db.prepare('DELETE FROM sessions WHERE id = ?').run(id); // deactivated: the cookie is dead
			return undefined;
		}
		return user;
	}

	deleteSession(token: string | undefined): void {
		const id = token?.split('.')[0];
		if (id) this.#db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
	}

	deleteAllSessions(userId: string): void {
		this.#db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
	}

	/** Replaces the password. Only the hash is stored. */
	setPassword(userId: string, password: string): void {
		this.#db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(password), userId);
	}
}

/** Limits wrong passwords per email. In memory, resets on restart. Enough for a prototype. */
export class LoginThrottle {
	#fails = new Map<string, number[]>();
	constructor(
		private max = LOGIN_MAX_FAILURES,
		private windowMs = LOGIN_WINDOW_MS,
		private now: () => number = Date.now
	) {}

	#recent(key: string): number[] {
		const cutoff = this.now() - this.windowMs;
		const recent = (this.#fails.get(key) ?? []).filter((t) => t > cutoff);
		// Keep a key only while it has failures. Otherwise random emails would fill the memory.
		if (recent.length === 0) this.#fails.delete(key);
		else this.#fails.set(key, recent);
		return recent;
	}

	isBlocked(email: string): boolean {
		return this.#recent(email.trim().toLowerCase()).length >= this.max;
	}

	recordFailure(email: string): void {
		const key = email.trim().toLowerCase();
		const failures = this.#recent(key);
		failures.push(this.now());
		this.#fails.set(key, failures);
		// A hard limit as well: if it is full, forget the oldest key.
		if (this.#fails.size > LOGIN_THROTTLE_MAX_KEYS) this.#fails.delete(this.#fails.keys().next().value as string);
	}

	reset(email: string): void {
		this.#fails.delete(email.trim().toLowerCase());
	}
}
