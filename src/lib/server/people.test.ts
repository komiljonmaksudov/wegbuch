import { describe, expect, it } from 'vitest';
import { openDb } from './db';
import { Auth, type User } from './auth';
import { AbsenceService, streamOf } from './absence-service';
import { EventLog } from './event-log';
import { People } from './people';
import { calculateBalance } from '../../core/events';

const TODAY = '2026-12-07';

function setup() {
	const db = openDb();
	const auth = new Auth(db);
	const add = (id: string, role: 'employee' | 'lead' | 'hr', managerId: string | null) =>
		auth.addUser({ id, email: `${id}@example.test`, name: id.toUpperCase(), role, managerId, password: 'pw-' + id });
	add('markus', 'lead', null);
	add('sabine', 'hr', null);
	add('anna', 'employee', 'markus');
	const log = new EventLog(db);
	for (const id of ['markus', 'sabine', 'anna']) {
		log.append(streamOf(id), -1, `seed-${id}`, [{ type: 'EntitlementGranted', data: { year: 2026, days: 30 } }]);
	}
	const service = new AbsenceService(log, auth, () => TODAY);
	const people = new People(auth, log, () => TODAY);
	const user = (id: string) => auth.getUser(id) as User;
	return { auth, log, service, people, user };
}

const input = { name: 'Nina Roth', email: 'Nina@Firma.test', role: 'employee' as const, managerId: 'markus', allowance: 28 };

describe('adding a person', () => {
	it('gives a one-time password, the allowance as an event, and refuses a second person with the same e-mail', () => {
		const { auth, people, log, user } = setup();
		const r = people.add(user('sabine'), input);
		if (!r.ok) throw new Error('expected ok');
		expect(auth.checkLogin('nina@firma.test', r.value.password)?.id).toBe(r.value.user.id); // e-mail is not case sensitive
		expect(calculateBalance(log.read(streamOf(r.value.user.id))).entitlement).toBe(28);

		const again = people.add(user('sabine'), input);
		expect(again.ok ? 'ok' : again.error.code).toBe('email_taken');
	});

	it('only HR may add, and bad input is refused', () => {
		const { people, user } = setup();
		expect(people.add(user('markus'), input).ok).toBe(false);
		const bad = people.add(user('sabine'), { ...input, email: 'not-an-email' });
		expect(bad.ok ? 'ok' : bad.error.code).toBe('invalid_input');
		const noLead = people.add(user('sabine'), { ...input, managerId: null });
		expect(noLead.ok ? 'ok' : noLead.error.code).toBe('invalid_input'); // an employee needs a lead
	});
});

describe('deactivating a person', () => {
	it('ends the login and sessions, cancels open requests, hides them from lists, and keeps every event', () => {
		const { auth, people, service, log, user } = setup();
		service.requestVacation(user('anna'), 'req-1', { from: '2026-12-14', to: '2026-12-15' });
		const token = auth.createSession('anna');
		const eventsBefore = log.read(streamOf('anna')).length;
		expect(auth.validateSession(token)?.id).toBe('anna');

		expect(people.setActive(user('sabine'), 'anna', false).ok).toBe(true);

		expect(auth.checkLogin('anna@example.test', 'pw-anna')).toBeUndefined();
		expect(auth.validateSession(token)).toBeUndefined(); // the old cookie is dead at once
		expect(calculateBalance(log.read(streamOf('anna'))).requests[0].status).toBe('cancelled');
		expect(log.read(streamOf('anna')).length).toBeGreaterThan(eventsBefore); // nothing deleted, only added
		expect(auth.listUsers().map((u) => u.id)).not.toContain('anna'); // not in calendars or approvals
		expect(auth.listUsers(true).map((u) => u.id)).toContain('anna'); // but HR still sees her

		expect(people.setActive(user('sabine'), 'anna', true).ok).toBe(true);
		expect(auth.checkLogin('anna@example.test', 'pw-anna')?.id).toBe('anna'); // and she can come back
	});

	it('cannot lock the company out: not yourself, not the last HR, not a lead with a team', () => {
		const { people, user } = setup();
		const code = (r: { ok: boolean; error?: { code: string } }) => (r.ok ? 'ok' : r.error!.code);
		expect(code(people.setActive(user('sabine'), 'sabine', false))).toBe('would_lock_out');
		expect(code(people.setActive(user('sabine'), 'markus', false))).toBe('has_team');
		expect(code(people.setActive(user('markus'), 'anna', false))).toBe('forbidden');
	});
});

describe('changing a person', () => {
	it('saves a new allowance as a new event and leaves the old one alone', () => {
		const { people, log, user } = setup();
		const before = log.read(streamOf('anna')).length;
		expect(people.update(user('sabine'), 'anna', { name: 'Anna Weber', email: 'anna@example.test', role: 'employee', managerId: 'markus', allowance: 32 }).ok).toBe(true);
		const events = log.read(streamOf('anna'));
		expect(events).toHaveLength(before + 1);
		expect(events.at(-1)).toMatchObject({ type: 'EntitlementGranted', data: { days: 2, change: true } });
		expect(calculateBalance(events).entitlement).toBe(32);
	});
});

describe('resetting a password', () => {
	it('gives a new one-time password and ends all logins. Only HR may, and not for themselves.', () => {
		const { auth, people, user } = setup();
		const token = auth.createSession('anna');

		const r = people.resetPassword(user('sabine'), 'anna');
		if (!r.ok) throw new Error('expected ok');
		expect(auth.checkLogin('anna@example.test', 'pw-anna')).toBeUndefined(); // the old password is dead
		expect(auth.checkLogin('anna@example.test', r.value.password)?.id).toBe('anna');
		expect(auth.validateSession(token)).toBeUndefined(); // so is every login she had

		expect(people.resetPassword(user('markus'), 'anna').ok).toBe(false); // a lead may not
		expect(people.resetPassword(user('sabine'), 'sabine').ok).toBe(false); // own password: on the profile page
	});
});
