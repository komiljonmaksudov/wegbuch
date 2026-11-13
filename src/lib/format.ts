// German date text. Dates are plain "YYYY-MM-DD" strings, so no time zone can move them.

export const fmtDate = (d: string) => d.split('-').reverse().join('.');

export const fmtDay = (d: string) => `${d.slice(8)}.${d.slice(5, 7)}.`;

const weekdayFmt = new Intl.DateTimeFormat('de-DE', { weekday: 'short', timeZone: 'UTC' });
export const fmtWeekday = (d: string) => weekdayFmt.format(new Date(`${d}T00:00:00Z`));

export const fmtRange = (from: string, to: string) =>
	from === to ? fmtDate(from) : `${fmtDate(from)} – ${fmtDate(to)}`;

export const initials = (name: string) =>
	name
		.split(/\s+/)
		.map((w) => w[0])
		.slice(0, 2)
		.join('')
		.toUpperCase();

/** Short range like the sketchbook: "23.–29.12.", "30.11.–02.12.", "12.08." Years only when they differ. */
export function fmtShortRange(from: string, to: string): string {
	const [fy, fm, fd] = from.split('-');
	const [ty, tm, td] = to.split('-');
	if (from === to) return `${fd}.${fm}.`;
	if (fy === ty && fm === tm) return `${fd}.–${td}.${tm}.`;
	if (fy === ty) return `${fd}.${fm}.–${td}.${tm}.`;
	return `${fmtDate(from)} – ${fmtDate(to)}`;
}

export const fmtDays = (n: number) => `${n} ${n === 1 ? 'Tag' : 'Tage'}`;

const monthFmt = new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric', timeZone: 'UTC' });
export const fmtMonth = (year: number, month: number) => monthFmt.format(new Date(Date.UTC(year, month - 1, 1)));
