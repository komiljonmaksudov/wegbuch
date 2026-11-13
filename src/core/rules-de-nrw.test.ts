import { describe, expect, it } from 'vitest';
import { countWorkingDays, easterSunday, holidayName, isWorkingDay } from './rules-de-nrw';

describe('easter and holidays', () => {
	it('computes Easter Sunday', () => {
		expect(easterSunday(2026)).toBe('2026-04-05');
		expect(easterSunday(2027)).toBe('2027-03-28');
	});

	it('matches known Easter dates, including the earliest and latest possible', () => {
		const known: Record<number, string> = {
			1818: '1818-03-22', // earliest possible
			2000: '2000-04-23',
			2019: '2019-04-21',
			2024: '2024-03-31',
			2025: '2025-04-20',
			2038: '2038-04-25' // latest possible
		};
		for (const [year, date] of Object.entries(known)) {
			expect(easterSunday(Number(year))).toBe(date);
		}
	});

	it('derives moving holidays from Easter', () => {
		expect(holidayName('2026-04-03')).toBe('Karfreitag');
		expect(holidayName('2027-03-26')).toBe('Karfreitag');
		expect(holidayName('2026-05-14')).toBe('Christi Himmelfahrt');
		expect(holidayName('2026-06-04')).toBe('Fronleichnam');
	});

	it('has NRW holidays and not Bavarian-only ones', () => {
		expect(holidayName('2026-11-01')).toBe('Allerheiligen');
		expect(holidayName('2026-01-06')).toBeUndefined(); // Heilige Drei Könige is not NRW
		expect(holidayName('2026-08-15')).toBeUndefined(); // Mariä Himmelfahrt is not NRW
	});

	it('treats 24.12. and 31.12. as normal working days (half-day rule is a company setting)', () => {
		expect(isWorkingDay('2026-12-24')).toBe(true);
		expect(isWorkingDay('2026-12-31')).toBe(true);
	});
});

describe('countWorkingDays', () => {
	it('matches the canvas: 23.12. to 29.12.2026 is 4 working days', () => {
		const r = countWorkingDays('2026-12-23', '2026-12-29');
		expect(r.days).toBe(4);
		expect(r.skippedHolidays.map((h) => h.date)).toEqual(['2026-12-25']); // 26.12. is a Saturday
	});

	it('skips weekends', () => {
		expect(countWorkingDays('2026-12-05', '2026-12-06').days).toBe(0);
		expect(countWorkingDays('2026-12-07', '2026-12-11').days).toBe(5);
	});

	it('counts a single day, both ends included', () => {
		expect(countWorkingDays('2026-12-07', '2026-12-07').days).toBe(1);
	});

	it('rejects an end before the start', () => {
		expect(() => countWorkingDays('2026-12-10', '2026-12-09')).toThrow();
	});

	it('works across a year change', () => {
		// Thu 31.12. + Fri 01.01. (Neujahr) + Mon 04.01.
		expect(countWorkingDays('2026-12-31', '2027-01-04').days).toBe(2);
	});
});
