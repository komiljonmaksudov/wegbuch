// Who is in the company. Only HR may change this. "Remove" always means deactivate:
// the person cannot log in any more and leaves the calendars, but every event they ever had stays in the log.

import { randomBytes } from 'node:crypto';
import { calculateBalance } from '../../core/events';
import { fail, ok, type Result } from '../../core/decide';
import type { IsoDate } from '../../core/rules-de-nrw';
import { streamOf } from './absence-service';
import type { Auth, Role, User } from './auth';
import type { EventLog } from './event-log';

export type PersonInput = {
	name: string;
	email: string;
	role: Role;
	managerId: string | null;
	allowance: number;
};

export type PersonRow = { user: User; allowance: number; managerName?: string };

const ROLES: Role[] = ['employee', 'lead', 'hr'];

export class People {
	#auth: Auth;
	#log: EventLog;
	#today: () => IsoDate;

	constructor(auth: Auth, log: EventLog, today: () => IsoDate) {
		this.#auth = auth;
		this.#log = log;
		this.#today = today;
	}

	/** Everyone, including deactivated people, with their yearly allowance. */
	list(): PersonRow[] {
		const everyone = this.#auth.listUsers(true);
		const names = new Map(everyone.map((u) => [u.id, u.name]));
		return everyone.map((user) => ({
			user,
			allowance: calculateBalance(this.#log.read(streamOf(user.id))).entitlement,
			managerName: user.managerId ? names.get(user.managerId) : undefined
		}));
	}

	/** Checks the input. Returns the cleaned values or the reason why not. */
	#check(input: PersonInput): Result<PersonInput> {
		const name = input.name.trim();
		const email = input.email.trim().toLowerCase();
		if (name.length < 1 || name.length > 100) return fail('invalid_input', 'Bitte gib einen Namen an.');
		if (email.length > 200 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
			return fail('invalid_input', 'Bitte gib eine gültige E-Mail an.');
		}
		if (!ROLES.includes(input.role)) return fail('invalid_input', 'Diese Rolle gibt es nicht.');
		if (!Number.isInteger(input.allowance) || input.allowance < 0 || input.allowance > 60) {
			return fail('invalid_input', 'Der Jahresanspruch muss eine ganze Zahl von 0 bis 60 sein.');
		}
		// Only employees have a lead. Leads and HR have nobody above them.
		let managerId: string | null = null;
		if (input.role === 'employee') {
			const lead = input.managerId ? this.#auth.getUser(input.managerId) : undefined;
			if (!lead || !lead.active || lead.role !== 'lead') {
				return fail('invalid_input', 'Bitte wähle eine Teamleitung.');
			}
			managerId = lead.id;
		}
		return ok({ name, email, role: input.role, managerId, allowance: input.allowance });
	}

	#isEmailTaken(e: unknown): boolean {
		return e instanceof Error && /UNIQUE constraint failed: users\.email/.test(e.message);
	}

	/** Adds a person. The one-time password is returned once and never stored in plain text. */
	add(actor: User, input: PersonInput): Result<{ user: User; password: string }> {
		if (actor.role !== 'hr') return fail('forbidden', 'Das darf nur HR.');
		const checked = this.#check(input);
		if (!checked.ok) return checked;
		const p = checked.value;

		const id = `u-${randomBytes(6).toString('hex')}`;
		const password = randomBytes(12).toString('base64url');
		try {
			this.#auth.addUser({ id, email: p.email, name: p.name, role: p.role, managerId: p.managerId, password });
		} catch (e) {
			if (this.#isEmailTaken(e)) return fail('email_taken', 'Diese E-Mail gibt es schon.');
			throw e;
		}
		this.#log.append(streamOf(id), -1, `person-added|${id}`, [
			{ type: 'EntitlementGranted', data: { year: Number(this.#today().slice(0, 4)), days: p.allowance } }
		]);
		return ok({ user: this.#auth.getUser(id) as User, password });
	}

	/** Changes name, e-mail, role, lead and allowance. A changed allowance is saved as a new event. */
	update(actor: User, id: string, input: PersonInput): Result<null> {
		if (actor.role !== 'hr') return fail('forbidden', 'Das darf nur HR.');
		const target = this.#auth.getUser(id);
		if (!target) return fail('unknown_user', 'Diese Person gibt es nicht.');
		const checked = this.#check(input);
		if (!checked.ok) return checked;
		const p = checked.value;

		if (target.role === 'hr' && p.role !== 'hr' && this.#activeHr().length <= 1 && target.active) {
			return fail('would_lock_out', 'Es muss mindestens eine HR-Person aktiv bleiben.');
		}
		if (target.role === 'lead' && p.role !== 'lead' && this.#team(id).length > 0) {
			return fail('has_team', 'Diese Teamleitung hat noch ein Team. Ordne das Team zuerst neu zu.');
		}
		try {
			this.#auth.updateUser(id, { name: p.name, email: p.email, role: p.role, managerId: p.managerId });
		} catch (e) {
			if (this.#isEmailTaken(e)) return fail('email_taken', 'Diese E-Mail gibt es schon.');
			throw e;
		}

		const stream = streamOf(id);
		const current = calculateBalance(this.#log.read(stream)).entitlement;
		if (p.allowance !== current) {
			this.#log.append(stream, this.#log.version(stream), `allowance|${id}|${randomBytes(6).toString('hex')}`, [
				{
					type: 'EntitlementGranted',
					data: { year: Number(this.#today().slice(0, 4)), days: p.allowance - current, change: true }
				}
			]);
		}
		return ok(null);
	}

	/**
	 * Deactivate or reactivate. Deactivating: logins end, open requests are cancelled, nothing is deleted.
	 * You cannot deactivate yourself, the last HR person, or a lead who still has a team.
	 */
	setActive(actor: User, id: string, active: boolean): Result<null> {
		if (actor.role !== 'hr') return fail('forbidden', 'Das darf nur HR.');
		const target = this.#auth.getUser(id);
		if (!target) return fail('unknown_user', 'Diese Person gibt es nicht.');

		if (!active) {
			if (id === actor.id) return fail('would_lock_out', 'Du kannst dich nicht selbst deaktivieren.');
			if (target.role === 'hr' && target.active && this.#activeHr().length <= 1) {
				return fail('would_lock_out', 'Es muss mindestens eine HR-Person aktiv bleiben.');
			}
			if (target.role === 'lead' && this.#team(id).length > 0) {
				return fail('has_team', 'Diese Teamleitung hat noch ein Team. Ordne das Team zuerst neu zu.');
			}
			this.#auth.setActive(id, false);
			// Open requests would wait for a person who is gone. Cancel them, one event each.
			const stream = streamOf(id);
			for (const r of calculateBalance(this.#log.read(stream)).requests) {
				if (r.status !== 'open') continue;
				this.#log.append(stream, this.#log.version(stream), `deactivate|${id}|${r.requestId}`, [
					{ type: 'VacationCancelled', data: { requestId: r.requestId } }
				]);
			}
		} else {
			this.#auth.setActive(id, true);
		}
		return ok(null);
	}

	/**
	 * HR gives someone a new one-time password (they forgot theirs). All their logins end at once.
	 * Your own password you change on your profile, where the current one is asked.
	 */
	resetPassword(actor: User, id: string): Result<{ user: User; password: string }> {
		if (actor.role !== 'hr') return fail('forbidden', 'Das darf nur HR.');
		if (id === actor.id) return fail('invalid_input', 'Dein eigenes Passwort änderst du in deinem Profil.');
		const target = this.#auth.getUser(id);
		if (!target || !target.active) return fail('unknown_user', 'Diese Person gibt es nicht.');
		const password = randomBytes(12).toString('base64url');
		this.#auth.setPassword(id, password);
		this.#auth.deleteAllSessions(id);
		return ok({ user: target, password });
	}

	#activeHr(): User[] {
		return this.#auth.listUsers().filter((u) => u.role === 'hr');
	}

	#team(leadId: string): User[] {
		return this.#auth.listUsers().filter((u) => u.managerId === leadId);
	}
}
