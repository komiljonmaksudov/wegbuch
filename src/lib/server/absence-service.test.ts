import { openDb } from './db';
import { describe, expect, it } from 'vitest';
import { Auth, type Role, type User } from './auth';
import { AbsenceService, streamOf } from './absence-service';
import { EventLog } from './event-log';
import { annaDemoEvents } from '../../core/demo-data';
import type { AbsenceEvent } from '../../core/events';

const TODAY = '2026-12-07';

function setup() {
	const auth = new Auth(openDb());
	const add = (id: string, role: Role, managerId: string | null) =>
		auth.addUser({ id, email: `${id}@example.test`, name: id.toUpperCase(), role, managerId, password: 'x' });
	add('markus', 'lead', null);
	add('otto', 'lead', null);
	add('sabine', 'hr', null);
	add('anna', 'employee', 'markus');
	add('tim', 'employee', 'markus');
	add('elif', 'employee', 'markus');
	add('ida', 'employee', 'otto');

	const store = new EventLog(openDb(), () => '2026-12-07T08:00:00.000Z');
	store.append(streamOf('anna'), -1, 'seed-anna', annaDemoEvents());
	const grant: AbsenceEvent = { type: 'EntitlementGranted', data: { year: 2026, days: 30 } };
	for (const id of ['tim', 'elif', 'ida']) store.append(streamOf(id), -1, `seed-${id}`, [grant]);

	const commands = new AbsenceService(store, auth, () => TODAY);
	const user = (id: string) => auth.getUser(id) as User;
	return { auth, store, commands, user };
}

const code = (r: { ok: boolean; error?: { code: string } }) => (r.ok ? 'ok' : r.error!.code);

describe('requestVacation', () => {
	it('stores the request and shows who is away at the same time', () => {
		const { store, commands, user } = setup();
		store.append(streamOf('elif'), 0, 'elif-sick', [{ type: 'SickReported', data: { from: '2026-12-07', to: '2026-12-08' } }]);
		store.append(streamOf('tim'), 0, 'tim-off', [
			{ type: 'VacationRequested', data: { requestId: 't', from: '2026-12-10', to: '2026-12-11', days: 2 } },
			{ type: 'VacationApproved', data: { requestId: 't', by: 'markus' } }
		]);

		const r = commands.requestVacation(user('anna'), 'c1', { from: '2026-12-08', to: '2026-12-10' });
		expect(r.ok && r.value.days).toBe(3);
		expect(r.ok && r.value.away.map((a) => a.employeeId).sort()).toEqual(['elif', 'tim']);
		expect(commands.balance('anna').requested).toBe(4 + 3);
	});

	it('does not show people from another team', () => {
		const { commands, user } = setup();
		const away = commands.teamAway(user('anna'), '2026-01-01', '2026-12-31').map((a) => a.employeeId);
		expect(away).not.toContain('ida');
	});

	it('a repeated command id changes nothing and still answers ok', () => {
		const { store, commands, user } = setup();
		const first = commands.requestVacation(user('anna'), 'same', { from: '2026-12-14', to: '2026-12-15' });
		const again = commands.requestVacation(user('anna'), 'same', { from: '2026-12-14', to: '2026-12-15' });
		expect(first.ok && !first.value.duplicate).toBe(true);
		expect(again.ok && again.value.duplicate).toBe(true); // the rules would now say "overlap", but we never ask them
		expect(store.read(streamOf('anna')).filter((e) => e.type === 'VacationRequested')).toHaveLength(5);
	});

	it('passes a rule error back and writes nothing', () => {
		const { store, commands, user } = setup();
		const before = store.version(streamOf('anna'));
		expect(code(commands.requestVacation(user('anna'), 'c2', { from: '2026-12-01', to: '2026-12-02' }))).toBe('in_past');
		expect(store.version(streamOf('anna'))).toBe(before);
	});
});

describe('decide (who may decide)', () => {
	const input = { employeeId: 'anna', requestId: 'r-dec', approve: true };

	it('the lead of the team can approve: 18 becomes 14', () => {
		const { commands, user } = setup();
		expect(commands.decide(user('markus'), 'd1', input).ok).toBe(true);
		expect(commands.balance('anna').remaining).toBe(14);
	});

	it('HR can decide for anyone', () => {
		const { commands, user } = setup();
		expect(commands.decide(user('sabine'), 'd1', input).ok).toBe(true);
	});

	it.each([
		['a colleague', 'tim'],
		['the person themselves', 'anna'],
		['a lead of another team', 'otto']
	])('%s may not decide', (_who, actorId) => {
		const { commands, user, store } = setup();
		const before = store.version(streamOf('anna'));
		expect(code(commands.decide(user(actorId), 'd1', input))).toBe('forbidden');
		expect(store.version(streamOf('anna'))).toBe(before);
	});

	it('rejects an unknown person and a request that is already decided', () => {
		const { commands, user } = setup();
		expect(code(commands.decide(user('markus'), 'd1', { ...input, employeeId: 'ghost' }))).toBe('unknown_user');
		expect(code(commands.decide(user('markus'), 'd2', { ...input, requestId: 'r-aug' }))).toBe('not_open');
	});

	it('a double click on Approve is harmless', () => {
		const { commands, user } = setup();
		commands.decide(user('markus'), 'same', input);
		expect(commands.decide(user('markus'), 'same', input).ok).toBe(true);
		expect(commands.balance('anna').remaining).toBe(14); // not 10
	});
});

describe('two people write at the same time', () => {
	it('the second writer reads again and the rules see the first write', () => {
		const { store, commands, user } = setup();
		// Ida has 30 days. A first request of 25 days is in flight.
		// While it is being decided, a competing 25-day request lands in the same stream.
		const original = store.append.bind(store);
		let first = true;
		store.append = (streamId, expected, commandId, events) => {
			if (first) {
				first = false;
				original(streamId, expected, 'competitor', [
					{ type: 'VacationRequested', data: { requestId: 'rival', from: '2027-02-01', to: '2027-03-05', days: 25 } }
				]);
			}
			return original(streamId, expected, commandId, events);
		};

		const r = commands.requestVacation(user('ida'), 'mine', { from: '2027-04-05', to: '2027-05-07' });
		// 25 already taken by the rival, 5 free: our request must now be refused, not both accepted
		expect(code(r)).toBe('not_enough_days');
		const requests = store.read(streamOf('ida')).filter((e) => e.type === 'VacationRequested');
		expect(requests).toHaveLength(1);
		expect(commands.balance('ida').free).toBe(5);
	});
});

describe('reportSick and cancel', () => {
	it('sick needs no approval. The team sees "absent", only HR sees "sick" (privacy rule)', () => {
		const { commands, user } = setup();
		expect(commands.reportSick(user('elif'), 's1', { from: TODAY, to: TODAY }).ok).toBe(true);
		const team = commands.teamAway(user('anna'), TODAY, TODAY);
		expect(team).toEqual([expect.objectContaining({ employeeId: 'elif', kind: 'absent' })]);
		expect(JSON.stringify(team)).not.toContain('sick');
		// HR looks at the same team through its own manager link: give Sabine the same manager to compare
		const hr = commands.teamAway({ ...user('sabine'), managerId: 'markus' }, TODAY, TODAY);
		expect(hr).toEqual([expect.objectContaining({ employeeId: 'elif', kind: 'sick' })]);
	});

	it('refuses a sick start in the future', () => {
		const { commands, user } = setup();
		expect(code(commands.reportSick(user('elif'), 's1', { from: '2026-12-09', to: '2026-12-09' }))).toBe('in_future');
	});

	it('cancels an own open request and refuses someone else request', () => {
		const { commands, user } = setup();
		expect(code(commands.cancel(user('tim'), 'x1', { requestId: 'r-dec' }))).toBe('unknown_request'); // Anna's, not Tim's
		expect(commands.cancel(user('anna'), 'x2', { requestId: 'r-dec' }).ok).toBe(true);
		expect(commands.balance('anna').requested).toBe(0);
	});
});

describe('command ids', () => {
	it("an id chosen by one user cannot block another user's command", () => {
		const { commands, user } = setup();
		// Anna can guess the id Markus's screen will use to decide her open request, and uses it first.
		commands.reportSick(user('anna'), 'decide-r-dec', { from: TODAY, to: TODAY });
		// Markus decides with exactly that id. His decision must still happen.
		const r = commands.decide(user('markus'), 'decide-r-dec', { employeeId: 'anna', requestId: 'r-dec', approve: true });
		expect(r.ok && !r.value.duplicate).toBe(true);
		expect(commands.balance('anna').remaining).toBe(14);
	});
});
