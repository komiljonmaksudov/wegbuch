import { describe, expect, it } from 'vitest';
import {
	decideCancel,
	decideDecision,
	decideRequest,
	decideSick,
	isValidDate,
	overlappingAbsences,
	todayBerlin
} from './decide';
import { absences, calculateBalance, type AbsenceEvent } from './events';
import { annaDemoEvents } from './demo-data';

const TODAY = '2026-12-07'; // the day of the design story

const grant = (days: number): AbsenceEvent => ({ type: 'EntitlementGranted', data: { year: 2026, days } });
const asEvents = (r: { ok: boolean; value?: { events: AbsenceEvent[] } }) => {
	if (!r.ok) throw new Error('expected ok');
	return r.value!.events;
};
const message = (r: { ok: boolean; error?: { code: string } }) => (r.ok ? 'ok' : r.error!.code);

describe('dates', () => {
	it('accepts real dates only', () => {
		expect(isValidDate('2026-12-23')).toBe(true);
		expect(isValidDate('2026-02-30')).toBe(false);
		expect(isValidDate('2026-2-3')).toBe(false);
		expect(isValidDate(undefined)).toBe(false);
	});

	it('todayBerlin follows the wall clock in Germany, not UTC', () => {
		expect(todayBerlin(new Date('2026-12-07T12:00:00Z'))).toBe('2026-12-07');
		// 23:30 UTC is already 00:30 the next day in Berlin (UTC+1 in winter)
		expect(todayBerlin(new Date('2026-12-07T23:30:00Z'))).toBe('2026-12-08');
		// summer: UTC+2
		expect(todayBerlin(new Date('2026-07-01T22:30:00Z'))).toBe('2026-07-02');
	});
});

describe('limits', () => {
	it('rejects dates far outside normal life (year 9999 crashed the server)', () => {
		expect(isValidDate('9999-12-31')).toBe(false);
		expect(isValidDate('1900-01-01')).toBe(false);
		expect(isValidDate('2026-12-07')).toBe(true);
	});

	it('rejects a period longer than a year, for vacation and for sick leave', () => {
		expect(message(decideRequest([grant(30)], { requestId: 'x', from: '2026-12-14', to: '2028-12-14' }, TODAY))).toBe(
			'invalid_range'
		);
		expect(message(decideSick({ from: '2024-01-01', to: TODAY }, TODAY))).toBe('invalid_range');
	});
});

describe('decideRequest', () => {
	const base = annaDemoEvents(); // 14 free days, an open request for 23.-29.12.

	it('counts working days and reports the skipped holiday', () => {
		const r = decideRequest([grant(30)], { requestId: 'a', from: '2026-12-23', to: '2026-12-29' }, TODAY);
		expect(r.ok && r.value.days).toBe(4);
		expect(r.ok && r.value.skippedHolidays.map((h) => h.date)).toEqual(['2026-12-25']);
	});

	it('trims the comment and drops an empty one', () => {
		const withText = asEvents(
			decideRequest([grant(30)], { requestId: 'a', from: '2026-12-14', to: '2026-12-14', comment: '  Umzug  ' }, TODAY)
		);
		expect(withText[0]).toMatchObject({ data: { comment: 'Umzug' } });
		const empty = asEvents(
			decideRequest([grant(30)], { requestId: 'b', from: '2026-12-14', to: '2026-12-14', comment: '   ' }, TODAY)
		);
		expect((empty[0] as { data: { comment?: string } }).data.comment).toBeUndefined();
	});

	it.each([
		['impossible date', '2026-02-30', '2026-03-02', 'invalid_date'],
		['end before start', '2026-12-18', '2026-12-14', 'invalid_range'],
		['start in the past', '2026-12-01', '2026-12-09', 'in_past'],
		['only a weekend', '2026-12-12', '2026-12-13', 'no_working_days'],
		['only a holiday', '2026-12-25', '2026-12-25', 'no_working_days']
	])('rejects %s', (_name, from, to, code) => {
		expect(message(decideRequest([grant(30)], { requestId: 'a', from, to }, TODAY))).toBe(code);
	});

	it('allows today as the first day', () => {
		expect(decideRequest([grant(30)], { requestId: 'a', from: TODAY, to: TODAY }, TODAY).ok).toBe(true);
	});

	it('rejects more days than are free, counting open requests', () => {
		// 14 free. 15 working days: Mon 04.01. to Fri 22.01.2027
		const r = decideRequest(base, { requestId: 'x', from: '2027-01-04', to: '2027-01-22' }, TODAY);
		expect(message(r)).toBe('not_enough_days');
		// exactly 14 free is fine: Mon 04.01. to Thu 21.01.
		expect(decideRequest(base, { requestId: 'x', from: '2027-01-04', to: '2027-01-21' }, TODAY).ok).toBe(true);
	});

	it('rejects an overlap with an own open or approved request', () => {
		expect(message(decideRequest(base, { requestId: 'x', from: '2026-12-28', to: '2026-12-30' }, TODAY))).toBe(
			'overlaps_own'
		);
	});

	it('does not count a rejected or cancelled request as an overlap', () => {
		// 02.-03.11. was rejected in the demo data, but it is in the past; use a fresh rejected one
		const events: AbsenceEvent[] = [
			grant(30),
			{ type: 'VacationRequested', data: { requestId: 'r', from: '2026-12-14', to: '2026-12-15', days: 2 } },
			{ type: 'VacationRejected', data: { requestId: 'r', by: 'markus' } }
		];
		expect(decideRequest(events, { requestId: 'x', from: '2026-12-14', to: '2026-12-15' }, TODAY).ok).toBe(true);
	});
});

describe('decideDecision', () => {
	it('approving the open December request takes Anna from 18 to 14', () => {
		const events = annaDemoEvents();
		const approve = asEvents(decideDecision(events, { requestId: 'r-dec', approve: true, by: 'markus' }));
		expect(calculateBalance([...events, ...approve]).remaining).toBe(14);
	});

	it('rejecting keeps the balance and stores the comment', () => {
		const events = annaDemoEvents();
		const reject = asEvents(
			decideDecision(events, { requestId: 'r-dec', approve: false, by: 'markus', comment: 'Release' })
		);
		const b = calculateBalance([...events, ...reject]);
		expect(b.remaining).toBe(18);
		expect(b.requests.find((r) => r.requestId === 'r-dec')).toMatchObject({
			status: 'rejected',
			decisionComment: 'Release'
		});
	});

	it('cannot decide twice or on an unknown request', () => {
		const events = annaDemoEvents();
		expect(message(decideDecision(events, { requestId: 'r-aug', approve: true, by: 'markus' }))).toBe('not_open');
		expect(message(decideDecision(events, { requestId: 'nope', approve: true, by: 'markus' }))).toBe('unknown_request');
	});

	it('refuses to approve what would overdraw the balance (days would be spent twice)', () => {
		// Two 10-day requests were both made while 18 days were free (a race). Only one can be approved.
		const events: AbsenceEvent[] = [
			grant(18),
			{ type: 'VacationRequested', data: { requestId: 'a', from: '2026-12-07', to: '2026-12-18', days: 10 } },
			{ type: 'VacationRequested', data: { requestId: 'b', from: '2027-01-04', to: '2027-01-15', days: 10 } }
		];
		const first = asEvents(decideDecision(events, { requestId: 'a', approve: true, by: 'markus' }));
		const after = [...events, ...first];
		expect(calculateBalance(after).remaining).toBe(8);
		expect(message(decideDecision(after, { requestId: 'b', approve: true, by: 'markus' }))).toBe('not_enough_days');
		// rejecting is still possible
		expect(decideDecision(after, { requestId: 'b', approve: false, by: 'markus' }).ok).toBe(true);
	});
});

describe('decideCancel', () => {
	it('cancels an open request, and an approved one that has not started', () => {
		const events = annaDemoEvents();
		expect(decideCancel(events, { requestId: 'r-dec' }, TODAY).ok).toBe(true);
		const approved = [...events, ...asEvents(decideDecision(events, { requestId: 'r-dec', approve: true, by: 'markus' }))];
		const cancelled = [...approved, ...asEvents(decideCancel(approved, { requestId: 'r-dec' }, TODAY))];
		expect(calculateBalance(cancelled).remaining).toBe(18); // the 4 days come back
	});

	it('cannot cancel what already started, was rejected, or does not exist', () => {
		const events = annaDemoEvents();
		expect(message(decideCancel(events, { requestId: 'r-nov-b' }, TODAY))).toBe('not_cancellable'); // approved, in the past
		expect(message(decideCancel(events, { requestId: 'r-nov-a' }, TODAY))).toBe('not_cancellable'); // rejected
		expect(message(decideCancel(events, { requestId: 'nope' }, TODAY))).toBe('unknown_request');
	});
});

describe('decideSick', () => {
	it('accepts today and earlier, with an end in the future', () => {
		expect(decideSick({ from: TODAY, to: '2026-12-09' }, TODAY).ok).toBe(true);
		expect(decideSick({ from: '2026-12-01', to: '2026-12-02' }, TODAY).ok).toBe(true);
	});

	it('rejects a start in the future and a bad range', () => {
		expect(message(decideSick({ from: '2026-12-08', to: '2026-12-08' }, TODAY))).toBe('in_future');
		expect(message(decideSick({ from: '2026-12-07', to: '2026-12-01' }, TODAY))).toBe('invalid_range');
	});

	it('inside approved vacation, the sick day gives the vacation day back', () => {
		const events: AbsenceEvent[] = [
			grant(30),
			{ type: 'VacationRequested', data: { requestId: 'a', from: '2026-12-07', to: '2026-12-11', days: 5 } },
			{ type: 'VacationApproved', data: { requestId: 'a', by: 'markus' } }
		];
		// Sick from today (Mon 07.12.) to Tue 08.12.: two vacation days inside the approved week
		const sick = asEvents(decideSick({ from: TODAY, to: '2026-12-08' }, TODAY));
		expect(calculateBalance([...events, ...sick]).remaining).toBe(27); // 30 - 5 + 2
	});
});

describe('overlap warning', () => {
	const team = [
		{ employeeId: 'elif', absences: absences([{ type: 'SickReported', data: { from: '2026-12-07', to: '2026-12-08' } }]) },
		{
			employeeId: 'tim',
			absences: [{ from: '2026-12-10', to: '2026-12-11', kind: 'vacation' as const }]
		}
	];

	it('lists teammates who are away at some point in the period', () => {
		const found = overlappingAbsences({ from: '2026-12-08', to: '2026-12-10' }, team);
		expect(found.map((f) => f.employeeId).sort()).toEqual(['elif', 'tim']);
	});

	it('finds nobody when the periods do not touch', () => {
		expect(overlappingAbsences({ from: '2026-12-14', to: '2026-12-18' }, team)).toEqual([]);
	});

	it('counts a shared boundary day', () => {
		expect(overlappingAbsences({ from: '2026-12-11', to: '2026-12-14' }, team).map((f) => f.employeeId)).toEqual(['tim']);
	});
});
