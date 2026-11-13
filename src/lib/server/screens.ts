// Read side: what each screen shows. Never writes. Privacy rules live here, on the server:
// only HR gets the word "sick". Everyone else gets "absent".

import { absences, calculateBalance, type AbsenceEvent, type Balance, type VacationRequest } from '../../core/events';
import { addDays, countWorkingDays, holidayName, nextHolidays, weekday, type IsoDate } from '../../core/rules-de-nrw';
import type { Auth, User } from './auth';
import { streamOf, type Away, type AbsenceService } from './absence-service';
import type { EventLog, StoredEvent } from './event-log';

export type Row =
	| (VacationRequest & { kind: 'vacation'; canCancel: boolean; decidedByName?: string })
	| { kind: 'sick'; from: IsoDate; to: IsoDate; days: number; creditedDays: number };

export type CellKind = 'vacation' | 'open' | 'absent' | 'sick';

/** One day of a request, for the little strip on the approval sheet. */
export type StripDay = { date: IsoDate; wd: number; n: number; kind: 'work' | 'weekend' | 'holiday' };

function dayStrip(from: IsoDate, to: IsoDate): StripDay[] {
	const out: StripDay[] = [];
	for (let d = from; d <= to && out.length < 21; d = addDays(d, 1)) {
		const wd = weekday(d);
		out.push({ date: d, wd, n: Number(d.slice(8)), kind: holidayName(d) ? 'holiday' : wd === 0 || wd === 6 ? 'weekend' : 'work' });
	}
	return out;
}

export type Pending = {
	employeeId: string;
	employeeName: string;
	strip: StripDay[];
	request: VacationRequest;
	remainingBefore: number;
	remainingAfter: number;
	away: Away[];
};

export type LedgerLine = { label: string; delta: number };

export class Screens {
	#store: EventLog;
	#auth: Auth;
	#commands: AbsenceService;

	constructor(store: EventLog, auth: Auth, commands: AbsenceService) {
		this.#store = store;
		this.#auth = auth;
		this.#commands = commands;
	}

	#events(employeeId: string): AbsenceEvent[] {
		return this.#store.read(streamOf(employeeId));
	}

	#name(id: string): string {
		return this.#auth.getUser(id)?.name ?? id;
	}

	/** "Mein Urlaub": balance, my requests and sick notes, next holidays. */
	overview(user: User): { balance: Balance; rows: Row[]; holidays: { date: IsoDate; name: string }[] } {
		const events = this.#events(user.id);
		const balance = calculateBalance(events);
		const today = this.#commands.today();

		const vacations: Row[] = balance.requests.map((r) => ({
			...r,
			kind: 'vacation',
			canCancel: r.status === 'open' || (r.status === 'approved' && r.from > today),
			decidedByName: r.decidedBy ? this.#name(r.decidedBy) : undefined
		}));
		const approved = balance.requests.filter((r) => r.status === 'approved');
		const sick: Row[] = events.flatMap((e) => {
			if (e.type !== 'SickReported') return [];
			let creditedDays = 0;
			for (const r of approved) {
				const from = e.data.from > r.from ? e.data.from : r.from;
				const to = e.data.to < r.to ? e.data.to : r.to;
				if (from <= to) creditedDays += countWorkingDays(from, to).days;
			}
			const days = countWorkingDays(e.data.from, e.data.to).days;
			return [{ kind: 'sick' as const, from: e.data.from, to: e.data.to, days, creditedDays }];
		});

		const rows = [...vacations, ...sick].sort((a, b) => (a.from < b.from ? 1 : -1));
		return { balance, rows, holidays: nextHolidays(today, 5) };
	}

	/** Absences of the people this user may see, for the live warning in the request form. */
	teamAbsences(user: User): Away[] {
		return this.#commands.teamAway(user, this.#commands.today(), addDays(this.#commands.today(), 400));
	}

	/** Open requests this user may decide, with the numbers a decision needs. */
	pending(user: User): { open: Pending[]; recent: { employeeName: string; request: VacationRequest }[] } {
		if (user.role === 'employee') return { open: [], recent: [] };
		const people = this.#auth
			.listUsers()
			.filter((u) => u.id !== user.id && (user.role === 'hr' || u.managerId === user.id));
		const open: Pending[] = [];
		const recent: { employeeName: string; request: VacationRequest }[] = [];
		for (const person of people) {
			const balance = calculateBalance(this.#events(person.id));
			for (const request of balance.requests) {
				if (request.status === 'open') {
					open.push({
						employeeId: person.id,
						employeeName: person.name,
						strip: dayStrip(request.from, request.to),
						request,
						remainingBefore: balance.remaining,
						remainingAfter: balance.remaining - request.days,
						away: this.#commands.teamAway(person, request.from, request.to)
					});
				} else if (request.status === 'approved' || request.status === 'rejected') {
					recent.push({ employeeName: person.name, request });
				}
			}
		}
		open.sort((a, b) => (a.request.from < b.request.from ? -1 : 1));
		recent.sort((a, b) => (a.request.from < b.request.from ? 1 : -1));
		return { open, recent: recent.slice(0, 5) };
	}

	/** One month, one row per person. `hrView` only works for HR. */
	calendar(user: User, year: number, month: number, hrView: boolean) {
		const showSick = hrView && user.role === 'hr';
		const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
		const iso = (d: number) => `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
		const days = Array.from({ length: last }, (_, i) => {
			const date = iso(i + 1);
			const wd = weekday(date);
			return { n: i + 1, date, wd, weekend: wd === 0 || wd === 6, holiday: holidayName(date) };
		});

		const everyone = this.#auth.listUsers();
		const visible =
			user.role === 'hr'
				? everyone
				: user.role === 'lead'
					? everyone.filter((u) => u.managerId === user.id || u.id === user.id)
					: everyone.filter((u) => (user.managerId ? u.managerId === user.managerId : false) || u.id === user.id);

		const people = visible.map((p) => {
			const cells: Record<number, CellKind> = {};
			const canSeeOpen = p.id === user.id || user.role !== 'employee';
			for (const a of absences(this.#events(p.id))) {
				if (a.kind === 'open' && !canSeeOpen) continue;
				const kind: CellKind = a.kind === 'sick' ? (showSick ? 'sick' : 'absent') : a.kind;
				for (const d of days) if (d.date >= a.from && d.date <= a.to) cells[d.n] = kind;
			}
			return { id: p.id, name: p.name, isMe: p.id === user.id, cells };
		});

		// How many are away each day (approved vacation and sick, not open requests)
		const away = days.map((d) => people.filter((p) => p.cells[d.n] && p.cells[d.n] !== 'open').length);
		return { days, people, away, hrView: showSick };
	}

	/** HR only: everything that happened to one person, plus the days as a sum. */
	history(user: User, employeeId: string) {
		if (user.role !== 'hr') return undefined;
		const person = this.#auth.getUser(employeeId);
		if (!person) return undefined;
		const events: StoredEvent[] = this.#store.read(streamOf(employeeId)); // with seq, version and time

		const label = (e: StoredEvent): string => {
			const d = (s: IsoDate) => s.split('-').reverse().join('.');
			switch (e.type) {
				case 'EntitlementGranted':
					return e.data.change
						? `Anspruch geändert: ${e.data.days > 0 ? '+' : '−'}${Math.abs(e.data.days)} Tage`
						: `Jahresanspruch ${e.data.year}: ${e.data.days} Tage`;
				case 'VacationRequested':
					return `Urlaub beantragt ${d(e.data.from)} bis ${d(e.data.to)} (${e.data.days} Tage)`;
				case 'VacationApproved':
					return `Genehmigt von ${this.#name(e.data.by)}`;
				case 'VacationRejected':
					return `Abgelehnt von ${this.#name(e.data.by)}`;
				case 'VacationCancelled':
					return 'Storniert';
				case 'SickReported':
					return `Krank gemeldet ${d(e.data.from)} bis ${d(e.data.to)}`;
			}
		};

		// The sum: each event's effect on the remaining days is the difference to the step before.
		const ledger: LedgerLine[] = [];
		let before = 0;
		events.forEach((e, i) => {
			const after = calculateBalance(events.slice(0, i + 1)).remaining;
			if (after !== before) ledger.push({ label: label(e), delta: after - before });
			before = after;
		});

		return {
			person,
			rows: events.map((e) => ({
				seq: e.seq,
				version: e.version,
				type: e.type,
				at: e.occurredAt,
				text: label(e)
			})),
			ledger,
			remaining: before
		};
	}
}
