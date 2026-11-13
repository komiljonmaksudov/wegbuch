// Decisions: given what happened so far (the events) and an input, return new events or a reason why not.
// Pure functions. No database, no clock (today is passed in), no user lookup.

import { addDays, countWorkingDays, type DayCount, type IsoDate } from './rules-de-nrw';
import { calculateBalance, type AbsenceEvent, type Absence } from './events';
import { COMMENT_MAX_LENGTH, MAX_DAYS, YEAR_MAX, YEAR_MIN } from './constants';

export type ErrorCode =
	| 'invalid_date'
	| 'invalid_range'
	| 'in_past'
	| 'in_future'
	| 'no_working_days'
	| 'not_enough_days'
	| 'overlaps_own'
	| 'unknown_request'
	| 'not_open'
	| 'not_cancellable'
	| 'forbidden'
	| 'invalid_input'
	| 'email_taken'
	| 'would_lock_out'
	| 'has_team'
	| 'unknown_user'
	| 'conflict';

export type CommandError = { code: ErrorCode; message: string };
export type Result<T> = { ok: true; value: T } | { ok: false; error: CommandError };

export const ok = <T>(value: T): Result<T> => ({ ok: true, value });
export const fail = (code: ErrorCode, message: string): Result<never> => ({
	ok: false,
	error: { code, message }
});

/** Today's date in Germany. The date a person sees on the wall, not the date in UTC. */
export function todayBerlin(now = new Date()): IsoDate {
	return now.toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' }); // sv-SE prints YYYY-MM-DD
}

export function isValidDate(s: unknown): s is IsoDate {
	if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
	const [y, m, d] = s.split('-').map(Number);
	const date = new Date(Date.UTC(y, m - 1, d));
	// Years outside YEAR_MIN to YEAR_MAX are never real here. Year 9999 once crashed the server.
	return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d && y >= YEAR_MIN && y <= YEAR_MAX;
}

function cleanComment(c: string | undefined): string | undefined {
	const t = c?.trim().slice(0, COMMENT_MAX_LENGTH);
	return t ? t : undefined;
}

type Range = { from: IsoDate; to: IsoDate };

function checkRange({ from, to }: Range): Result<null> {
	if (!isValidDate(from) || !isValidDate(to)) return fail('invalid_date', 'Bitte gib ein gültiges Datum an.');
	if (to < from) return fail('invalid_range', 'Das Ende liegt vor dem Beginn.');
	if (to > addDays(from, MAX_DAYS)) return fail('invalid_range', 'Der Zeitraum darf höchstens ein Jahr lang sein.');
	return ok(null);
}

export function decideRequest(
	events: readonly AbsenceEvent[],
	input: Range & { requestId: string; comment?: string },
	today: IsoDate
): Result<{ events: AbsenceEvent[]; days: number; skippedHolidays: DayCount['skippedHolidays'] }> {
	const range = checkRange(input);
	if (!range.ok) return range;
	if (input.from < today) return fail('in_past', 'Der Beginn liegt in der Vergangenheit.');

	const { days, skippedHolidays } = countWorkingDays(input.from, input.to);
	if (days === 0) return fail('no_working_days', 'Im Zeitraum liegt kein Arbeitstag.');

	const balance = calculateBalance(events);
	if (days > balance.free) {
		return fail('not_enough_days', `Nicht genug freie Tage: ${balance.free} frei, ${days} beantragt.`);
	}
	const clash = balance.requests.find(
		(r) => (r.status === 'open' || r.status === 'approved') && r.from <= input.to && input.from <= r.to
	);
	if (clash) return fail('overlaps_own', 'Der Zeitraum überschneidet einen eigenen Antrag.');

	return ok({
		events: [
			{
				type: 'VacationRequested',
				data: {
					requestId: input.requestId,
					from: input.from,
					to: input.to,
					days,
					comment: cleanComment(input.comment)
				}
			}
		],
		days,
		skippedHolidays
	});
}

export function decideDecision(
	events: readonly AbsenceEvent[],
	input: { requestId: string; approve: boolean; by: string; comment?: string }
): Result<{ events: AbsenceEvent[] }> {
	const balance = calculateBalance(events);
	const request = balance.requests.find((r) => r.requestId === input.requestId);
	if (!request) return fail('unknown_request', 'Diesen Antrag gibt es nicht.');
	if (request.status !== 'open') return fail('not_open', 'Der Antrag ist schon entschieden.');
	// Last line of defence against spending days twice. The version check makes sure this balance is current.
	if (input.approve && request.days > balance.remaining) {
		return fail('not_enough_days', `Nicht genug Tage: ${balance.remaining} übrig, ${request.days} beantragt.`);
	}
	const data = { requestId: input.requestId, by: input.by, comment: cleanComment(input.comment) };
	return ok({
		events: [input.approve ? { type: 'VacationApproved', data } : { type: 'VacationRejected', data }]
	});
}

export function decideCancel(
	events: readonly AbsenceEvent[],
	input: { requestId: string },
	today: IsoDate
): Result<{ events: AbsenceEvent[] }> {
	const request = calculateBalance(events).requests.find((r) => r.requestId === input.requestId);
	if (!request) return fail('unknown_request', 'Diesen Antrag gibt es nicht.');
	const cancellable = request.status === 'open' || (request.status === 'approved' && request.from > today);
	if (!cancellable) return fail('not_cancellable', 'Dieser Antrag lässt sich nicht mehr stornieren.');
	return ok({ events: [{ type: 'VacationCancelled', data: { requestId: input.requestId } }] });
}

export function decideSick(input: Range, today: IsoDate): Result<{ events: AbsenceEvent[] }> {
	const range = checkRange(input);
	if (!range.ok) return range;
	if (input.from > today) return fail('in_future', 'Krank melden geht nur für heute oder früher.');
	return ok({ events: [{ type: 'SickReported', data: { from: input.from, to: input.to } }] });
}

/** Which teammates are away (or asked to be) during a period. The data behind the overlap warning. */
export function overlappingAbsences(
	range: Range,
	team: { employeeId: string; absences: readonly Absence[] }[]
): { employeeId: string; from: IsoDate; to: IsoDate; kind: Absence['kind'] }[] {
	return team.flatMap((t) =>
		t.absences
			.filter((a) => a.from <= range.to && range.from <= a.to)
			.map((a) => ({ employeeId: t.employeeId, ...a }))
	);
}
