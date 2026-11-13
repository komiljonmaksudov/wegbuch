import { describe, expect, it } from 'vitest';
import { calculateBalance, type AbsenceEvent } from './events';
import { annaDemoEvents } from './demo-data';
import { countWorkingDays } from './rules-de-nrw';

const grant = (days: number): AbsenceEvent => ({
	type: 'EntitlementGranted',
	data: { year: 2026, days }
});
const request = (id: string, from: string, to: string): AbsenceEvent => ({
	type: 'VacationRequested',
	data: { requestId: id, from, to, days: countWorkingDays(from, to).days }
});
const approve = (id: string): AbsenceEvent => ({
	type: 'VacationApproved',
	data: { requestId: id, by: 'markus' }
});

describe('calculateBalance (balance)', () => {
	it('gives Anna the design numbers: 18 of 30, 12 taken, 4 requested, 14 free', () => {
		const b = calculateBalance(annaDemoEvents());
		expect(b).toMatchObject({
			entitlement: 30,
			approvedDays: 13,
			credited: 1,
			taken: 12,
			requested: 4,
			remaining: 18,
			free: 14
		});
	});

	it('approving the open December request moves 18 to 14', () => {
		const b = calculateBalance([...annaDemoEvents(), approve('r-dec')]);
		expect(b.remaining).toBe(14);
		expect(b.requested).toBe(0);
	});

	it('an open request does not reduce the remaining days, a rejected one never counts', () => {
		const b = calculateBalance([grant(30), request('a', '2026-12-07', '2026-12-09')]);
		expect(b.remaining).toBe(30);
		expect(b.free).toBe(27);
		const rejected = calculateBalance([
			grant(30),
			request('a', '2026-12-07', '2026-12-09'),
			{ type: 'VacationRejected', data: { requestId: 'a', by: 'markus' } }
		]);
		expect(rejected.free).toBe(30);
	});

	it('cancelling an approved request gives the days back', () => {
		const b = calculateBalance([
			grant(30),
			request('a', '2026-12-07', '2026-12-09'),
			approve('a'),
			{ type: 'VacationCancelled', data: { requestId: 'a' } }
		]);
		expect(b.remaining).toBe(30);
	});

	it('sick days outside any approved vacation change nothing', () => {
		const b = calculateBalance([
			grant(30),
			{ type: 'SickReported', data: { from: '2026-12-07', to: '2026-12-09' } }
		]);
		expect(b.remaining).toBe(30);
	});

	it('sick credit counts only working days and never exceeds the request', () => {
		// Vacation Mon 07.12. to Fri 11.12. (5 days). Sick Fri 04.12. to Sun 13.12. covers all of it.
		const b = calculateBalance([
			grant(30),
			request('a', '2026-12-07', '2026-12-11'),
			approve('a'),
			{ type: 'SickReported', data: { from: '2026-12-04', to: '2026-12-13' } },
			{ type: 'SickReported', data: { from: '2026-12-07', to: '2026-12-11' } }
		]);
		expect(b.credited).toBe(5);
		expect(b.remaining).toBe(30);
	});

	it('ignores a decision on an unknown request', () => {
		const b = calculateBalance([grant(30), approve('missing')]);
		expect(b.remaining).toBe(30);
	});
});
