// Demo story for Anna Weber. Matches the design: 18 of 30 days left (12 taken, 4 requested, 14 free).
// The history sums up as +30 -10 +1 -3 = 18.

import type { AbsenceEvent } from './events';

export const ANNA_STREAM = 'Employee-anna';

const approvedWeek = (id: string, from: string, to: string, days: number, by = 'markus'): AbsenceEvent[] => [
	{ type: 'VacationRequested', data: { requestId: `r-${id}`, from, to, days } },
	{ type: 'VacationApproved', data: { requestId: `r-${id}`, by } }
];

/** What the rest of the team does around Anna's open request. Added on top of 30 days of entitlement. */
// The same story as the design canvas. For Anna's 23.-29.12. three teammates are away at the same time:
// Elif (21.-23.), Lena (21.-24. and 28.-31.) and Jonas (28.-31.). Markus, the lead, is not counted as a teammate.
export const teamDemoEvents: Record<string, AbsenceEvent[]> = {
	// sick on Mon 07.12. (the team only sees "abwesend"), then three vacation days before Christmas
	elif: [
		{ type: 'SickReported', data: { from: '2026-12-07', to: '2026-12-08' } },
		...approvedWeek('elif', '2026-12-21', '2026-12-23', 3)
	],
	// asked for 10.-11.12. and is still waiting: Markus has two requests to decide (Anna's and Tim's)
	tim: [{ type: 'VacationRequested', data: { requestId: 'r-tim', from: '2026-12-10', to: '2026-12-11', days: 2 } }],
	sara: approvedWeek('sara', '2026-12-14', '2026-12-18', 5),
	jonas: approvedWeek('jonas', '2026-12-28', '2026-12-31', 4),
	lena: [
		...approvedWeek('lena-1', '2026-12-21', '2026-12-24', 4),
		...approvedWeek('lena-2', '2026-12-28', '2026-12-31', 4)
	],
	// the lead is decided by HR
	markus: approvedWeek('markus', '2026-12-14', '2026-12-18', 5, 'sabine')
};

export function annaDemoEvents(): AbsenceEvent[] {
	return [
		{ type: 'EntitlementGranted', data: { year: 2026, days: 30 } },
		// 10.-21.08.: 10 working days, approved
		{
			type: 'VacationRequested',
			data: { requestId: 'r-aug', from: '2026-08-10', to: '2026-08-21', days: 10 }
		},
		{ type: 'VacationApproved', data: { requestId: 'r-aug', by: 'markus' } },
		// Sick on 12.08. inside that vacation: 1 day comes back
		{ type: 'SickReported', data: { from: '2026-08-12', to: '2026-08-12' } },
		// 02.-03.11.: rejected
		{
			type: 'VacationRequested',
			data: { requestId: 'r-nov-a', from: '2026-11-02', to: '2026-11-03', days: 2 }
		},
		{
			type: 'VacationRejected',
			data: { requestId: 'r-nov-a', by: 'markus', comment: 'Release-Woche, bitte verschieben.' }
		},
		// 16.-18.11.: approved, 3 days
		{
			type: 'VacationRequested',
			data: { requestId: 'r-nov-b', from: '2026-11-16', to: '2026-11-18', days: 3 }
		},
		{ type: 'VacationApproved', data: { requestId: 'r-nov-b', by: 'markus' } },
		// 23.-29.12.: open, 4 working days (25.12. is a holiday, 26.-27.12. weekend)
		{
			type: 'VacationRequested',
			data: { requestId: 'r-dec', from: '2026-12-23', to: '2026-12-29', days: 4 }
		}
	];
}
