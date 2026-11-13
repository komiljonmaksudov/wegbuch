// Country rules for Germany / NRW. Pure functions, no framework imports.
// Dates are plain ISO dates ("2026-12-23"), never timestamps, so time zones cannot shift a day.

export type IsoDate = string;

const MS_PER_DAY = 86_400_000;

function toUtc(d: IsoDate): number {
	const [y, m, day] = d.split('-').map(Number);
	return Date.UTC(y, m - 1, day);
}

function fromUtc(ms: number): IsoDate {
	return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(d: IsoDate, n: number): IsoDate {
	return fromUtc(toUtc(d) + n * MS_PER_DAY);
}

/** 0 = Sunday ... 6 = Saturday */
export function weekday(d: IsoDate): number {
	return new Date(toUtc(d)).getUTCDay();
}

/** Easter Sunday (Gregorian), "anonymous" algorithm by Meeus/Jones/Butcher. */
export function easterSunday(year: number): IsoDate {
	const a = year % 19;
	const b = Math.floor(year / 100);
	const c = year % 100;
	const d = Math.floor(b / 4);
	const e = b % 4;
	const f = Math.floor((b + 8) / 25);
	const g = Math.floor((b - f + 1) / 3);
	const h = (19 * a + b - d - g + 15) % 30;
	const i = Math.floor(c / 4);
	const k = c % 4;
	const l = (32 + 2 * e + 2 * i - h - k) % 7;
	const m = Math.floor((a + 11 * h + 22 * l) / 451);
	const month = Math.floor((h + l - 7 * m + 114) / 31);
	const day = ((h + l - 7 * m + 114) % 31) + 1;
	return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Public holidays in NRW for one year: date -> German name. */
export function holidaysNrw(year: number): Map<IsoDate, string> {
	const easter = easterSunday(year);
	const list: [IsoDate, string][] = [
		[`${year}-01-01`, 'Neujahr'],
		[addDays(easter, -2), 'Karfreitag'],
		[addDays(easter, 1), 'Ostermontag'],
		[`${year}-05-01`, 'Tag der Arbeit'],
		[addDays(easter, 39), 'Christi Himmelfahrt'],
		[addDays(easter, 50), 'Pfingstmontag'],
		[addDays(easter, 60), 'Fronleichnam'],
		[`${year}-10-03`, 'Tag der Deutschen Einheit'],
		[`${year}-11-01`, 'Allerheiligen'],
		[`${year}-12-25`, '1. Weihnachtstag'],
		[`${year}-12-26`, '2. Weihnachtstag']
	];
	return new Map(list);
}

// One holiday map per year, so a loop over many days does not recompute Easter each time.
const holidayCache = new Map<number, Map<IsoDate, string>>();

export function holidayName(d: IsoDate): string | undefined {
	const year = Number(d.slice(0, 4));
	let map = holidayCache.get(year);
	if (!map) {
		map = holidaysNrw(year);
		holidayCache.set(year, map);
	}
	return map.get(d);
}

/** The next public holidays on or after a date, oldest first. */
export function nextHolidays(from: IsoDate, count: number): { date: IsoDate; name: string }[] {
	const year = Number(from.slice(0, 4));
	return [...holidaysNrw(year), ...holidaysNrw(year + 1)]
		.filter(([date]) => date >= from)
		.sort(([a], [b]) => (a < b ? -1 : 1))
		.slice(0, count)
		.map(([date, name]) => ({ date, name }));
}

export function isWorkingDay(d: IsoDate): boolean {
	const wd = weekday(d);
	return wd !== 0 && wd !== 6 && !holidayName(d);
}

export type DayCount = {
	/** Working days (Mon to Fri, no NRW holiday) in the range, both ends included. */
	days: number;
	/** Public holidays that fall on a Mon to Fri in the range and were not counted. */
	skippedHolidays: { date: IsoDate; name: string }[];
};

export function countWorkingDays(from: IsoDate, to: IsoDate): DayCount {
	if (to < from) throw new Error('Das Ende liegt vor dem Beginn.');
	let days = 0;
	const skippedHolidays: DayCount['skippedHolidays'] = [];
	for (let d = from; d <= to; d = addDays(d, 1)) {
		const wd = weekday(d);
		if (wd === 0 || wd === 6) continue;
		const name = holidayName(d);
		if (name) skippedHolidays.push({ date: d, name });
		else days++;
	}
	return { days, skippedHolidays };
}
