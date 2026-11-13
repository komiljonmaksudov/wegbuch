import { openDb } from './db';
import { describe, expect, it } from 'vitest';
import { ConcurrencyError, EventLog } from './event-log';
import { calculateBalance } from '../../core/events';
import { ANNA_STREAM, annaDemoEvents } from '../../core/demo-data';

const fixedClock = () => '2026-12-07T08:00:00.000Z';
const grant = { type: 'EntitlementGranted', data: { year: 2026, days: 30 } } as const;

describe('EventLog', () => {
	it('appends and reads back in order, with versions starting at 0', () => {
		const store = new EventLog(openDb(), fixedClock);
		expect(store.version('Employee-x')).toBe(-1);
		store.append('Employee-x', -1, 'c1', [grant, grant]);
		const events = store.read('Employee-x');
		expect(events.map((e) => e.version)).toEqual([0, 1]);
		expect(events[0].occurredAt).toBe('2026-12-07T08:00:00.000Z');
		expect(store.version('Employee-x')).toBe(1);
	});

	it('rejects an append with a stale expected version', () => {
		const store = new EventLog(openDb(), fixedClock);
		store.append('Employee-x', -1, 'c1', [grant]);
		expect(() => store.append('Employee-x', -1, 'c2', [grant])).toThrow(ConcurrencyError);
		expect(store.read('Employee-x')).toHaveLength(1); // nothing half written
	});

	it('a repeated command id is a no-op', () => {
		const store = new EventLog(openDb(), fixedClock);
		store.append('Employee-x', -1, 'c1', [grant]);
		const again = store.append('Employee-x', -1, 'c1', [grant]);
		expect(again.duplicate).toBe(true);
		expect(store.read('Employee-x')).toHaveLength(1);
	});

	it('readAfter gives events across streams in global order (the sync cursor)', () => {
		const store = new EventLog(openDb(), fixedClock);
		store.append('Employee-a', -1, 'c1', [grant]);
		store.append('Employee-b', -1, 'c2', [grant]);
		store.append('Employee-a', 0, 'c3', [grant]);
		const all = store.readAfter(0);
		expect(all.map((e) => e.streamId)).toEqual(['Employee-a', 'Employee-b', 'Employee-a']);
		const cursor = all[1].seq;
		expect(store.readAfter(cursor).map((e) => e.commandId)).toEqual(['c3']);
	});

	it('rebuilds Anna from the store: 18 of 30', () => {
		const store = new EventLog(openDb(), fixedClock);
		store.append(ANNA_STREAM, -1, 'seed-anna', annaDemoEvents());
		const b = calculateBalance(store.read(ANNA_STREAM));
		expect(b.remaining).toBe(18);
		expect(b.free).toBe(14);
	});
});
