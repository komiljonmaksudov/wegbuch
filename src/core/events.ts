// Events are facts. The balance is never stored, it is computed from the events.
// Pure code: no database, no framework.

import { countWorkingDays, type IsoDate } from './rules-de-nrw';

export type AbsenceEvent =
	| { type: 'EntitlementGranted'; data: { year: number; days: number; change?: boolean } }
	| {
			type: 'VacationRequested';
			// `days` is counted once, when the request is made, so later rule changes
			// never rewrite history.
			data: { requestId: string; from: IsoDate; to: IsoDate; days: number; comment?: string };
	  }
	| { type: 'VacationApproved'; data: { requestId: string; by: string; comment?: string } }
	| { type: 'VacationRejected'; data: { requestId: string; by: string; comment?: string } }
	| { type: 'VacationCancelled'; data: { requestId: string } }
	// No reason is stored on purpose: health data (GDPR Art. 9).
	| { type: 'SickReported'; data: { from: IsoDate; to: IsoDate } };

export type RequestStatus = 'open' | 'approved' | 'rejected' | 'cancelled';

export type VacationRequest = {
	requestId: string;
	from: IsoDate;
	to: IsoDate;
	days: number;
	comment?: string;
	status: RequestStatus;
	decidedBy?: string;
	decisionComment?: string;
	/** Days given back because of sickness inside this approved vacation. */
	creditedDays: number;
};

export type Balance = {
	entitlement: number;
	/** Days of approved vacation, before sick credit. */
	approvedDays: number;
	/** Days given back for sickness inside approved vacation. */
	credited: number;
	/** approvedDays - credited */
	taken: number;
	/** Days of open requests. */
	requested: number;
	/** entitlement - taken ("18 von 30 Tagen übrig") */
	remaining: number;
	/** remaining - requested ("noch frei planbar") */
	free: number;
	requests: VacationRequest[];
};

export type Absence = { from: IsoDate; to: IsoDate; kind: 'vacation' | 'open' | 'sick' };

/** Every period one employee is (or asked to be) away. Used for the calendar and overlap warnings. */
export function absences(events: readonly AbsenceEvent[]): Absence[] {
	const out: Absence[] = [];
	for (const r of calculateBalance(events).requests) {
		if (r.status === 'approved') out.push({ from: r.from, to: r.to, kind: 'vacation' });
		else if (r.status === 'open') out.push({ from: r.from, to: r.to, kind: 'open' });
	}
	for (const e of events) if (e.type === 'SickReported') out.push({ ...e.data, kind: 'sick' });
	return out;
}

export function calculateBalance(events: readonly AbsenceEvent[]): Balance {
	let entitlement = 0;
	const requests = new Map<string, VacationRequest>();
	const sick: { from: IsoDate; to: IsoDate }[] = [];

	for (const e of events) {
		switch (e.type) {
			case 'EntitlementGranted':
				entitlement += e.data.days;
				break;
			case 'VacationRequested':
				requests.set(e.data.requestId, { ...e.data, status: 'open', creditedDays: 0 });
				break;
			case 'VacationApproved':
			case 'VacationRejected': {
				const r = requests.get(e.data.requestId);
				if (!r || r.status !== 'open') break; // ignore decisions on unknown or closed requests
				r.status = e.type === 'VacationApproved' ? 'approved' : 'rejected';
				r.decidedBy = e.data.by;
				r.decisionComment = e.data.comment;
				break;
			}
			case 'VacationCancelled': {
				const r = requests.get(e.data.requestId);
				if (r && (r.status === 'open' || r.status === 'approved')) r.status = 'cancelled';
				break;
			}
			case 'SickReported':
				sick.push(e.data);
				break;
		}
	}

	// Sick during approved vacation gives those working days back (capped at the request's days).
	for (const s of sick) {
		for (const r of requests.values()) {
			if (r.status !== 'approved') continue;
			const from = s.from > r.from ? s.from : r.from;
			const to = s.to < r.to ? s.to : r.to;
			if (from > to) continue;
			r.creditedDays = Math.min(r.days, r.creditedDays + countWorkingDays(from, to).days);
		}
	}

	let approvedDays = 0;
	let credited = 0;
	let requested = 0;
	for (const r of requests.values()) {
		if (r.status === 'approved') {
			approvedDays += r.days;
			credited += r.creditedDays;
		} else if (r.status === 'open') {
			requested += r.days;
		}
	}
	const taken = approvedDays - credited;
	const remaining = entitlement - taken;
	return {
		entitlement,
		approvedDays,
		credited,
		taken,
		requested,
		remaining,
		free: remaining - requested,
		requests: [...requests.values()]
	};
}
