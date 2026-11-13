import { describe, expect, it } from 'vitest';
import { openDb } from './db';
import { EventLog } from './event-log';
import { Live } from './live';

const setup = () => {
	const log = new EventLog(openDb());
	return { log, live: new Live(log) };
};
const entitle = [{ type: 'EntitlementGranted' as const, data: { year: 2026, days: 30 } }];
const sick = [{ type: 'SickReported' as const, data: { from: '2026-12-08', to: '2026-12-08' } }];

describe('live counters', () => {
	it('count only the kind of change, per person, and never leak a sick day into approvals', () => {
		const { log, live } = setup();
		log.append('Employee-anna', -1, 'c1', entitle);
		log.append('Employee-anna', 0, 'c2', sick);

		const anna = live.topicsFor('anna');
		expect(anna.mine).toBe(2);
		expect(anna.calendar).toBe(1); // the calendar shows "abwesend" to everyone
		expect(anna.approvals).toBe(0); // a sick report is no request
		expect(live.topicsFor('markus').mine).toBe(0); // other people's own entries stay quiet
	});

	it('streams the counters again after a change and stops when the browser leaves', async () => {
		const { log, live } = setup();
		const ctl = new AbortController();
		const seen: number[] = [];
		const done = (async () => {
			for await (const t of live.stream('anna', ctl.signal)) seen.push(t.mine);
		})();

		await new Promise((r) => setTimeout(r, 5));
		log.append('Employee-anna', -1, 'c1', entitle);
		await new Promise((r) => setTimeout(r, 5));
		ctl.abort();
		await done; // ends, no hanging promise

		expect(seen).toEqual([0, 1]);
	});
});
