// The running app's single instances, plus demo seed data on first start.

import { mkdirSync } from 'node:fs';
import { dev } from '$app/env';
import { dirname } from 'node:path';
import { openDb } from './db';
import { Auth, LoginThrottle, type Role } from './auth';
import { EventLog } from './event-log';
import { AbsenceService } from './absence-service';
import { Screens } from './screens';
import { People } from './people';
import { Live } from './live';
import { todayBerlin } from '../../core/decide';
import { ANNA_STREAM, annaDemoEvents, teamDemoEvents } from '../../core/demo-data';

const path = process.env.DATABASE_PATH ?? 'data/absence.db';
if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });

const db = openDb(path); // one connection, shared
export const auth = new Auth(db);
export const store = new EventLog(db);
export const throttle = new LoginThrottle();
/** "Today" is the real date in Germany. DEMO_TODAY=2026-12-07 pins it to the day of the design story. */
export const commands = new AbsenceService(store, auth, () => process.env.DEMO_TODAY ?? todayBerlin());

export const screens = new Screens(store, auth, commands);
export const people = new People(auth, store, () => commands.today());
/** Counts what changed, per kind. Browsers use it to reload only the parts that changed. */
export const live = new Live(store);

/** Demo password for every seeded user. Remove the seed before any real use. */
export const DEMO_PASSWORD = 'demo1234';

const DEMO_USERS: { id: string; name: string; role: Role; managerId: string | null }[] = [
	{ id: 'markus', name: 'Markus Hoffmann', role: 'lead', managerId: null },
	{ id: 'sabine', name: 'Sabine Krämer', role: 'hr', managerId: null },
	{ id: 'anna', name: 'Anna Weber', role: 'employee', managerId: 'markus' },
	{ id: 'elif', name: 'Elif Yılmaz', role: 'employee', managerId: 'markus' },
	{ id: 'tim', name: 'Tim Wagner', role: 'employee', managerId: 'markus' },
	{ id: 'sara', name: 'Sara Klein', role: 'employee', managerId: 'markus' },
	{ id: 'jonas', name: 'Jonas Beck', role: 'employee', managerId: 'markus' },
	{ id: 'lena', name: 'Lena Fischer', role: 'employee', managerId: 'markus' }
];

export const demoEmail = (id: string) => `${id}@example.test`;

function seed() {
	if (auth.userCount() === 0) {
		for (const u of DEMO_USERS) {
			auth.addUser({ ...u, email: demoEmail(u.id), password: DEMO_PASSWORD });
		}
	}
	// Command ids make this safe to run on every start: a repeat changes nothing.
	for (const u of DEMO_USERS.filter((u) => u.id !== 'anna')) {
		store.append(`Employee-${u.id}`, store.version(`Employee-${u.id}`), `seed-${u.id}`, [
			{ type: 'EntitlementGranted', data: { year: 2026, days: 30 } }
		]);
	}
	for (const [id, events] of Object.entries(teamDemoEvents)) {
		store.append(`Employee-${id}`, store.version(`Employee-${id}`), `seed-team-${id}`, events);
	}
	store.append(ANNA_STREAM, store.version(ANNA_STREAM), 'seed-anna', annaDemoEvents());
}

/** The first HR account for a real start, from the environment: ADMIN_EMAIL and ADMIN_PASSWORD. Only if nobody exists. */
function createFirstAdmin() {
	const email = process.env.ADMIN_EMAIL;
	const password = process.env.ADMIN_PASSWORD;
	if (auth.userCount() > 0 || !email || !password) return;
	auth.addUser({ id: 'admin', email, name: 'Administrator', role: 'hr', managerId: null, password });
	store.append('Employee-admin', -1, 'seed-admin', [{ type: 'EntitlementGranted', data: { year: 2026, days: 30 } }]);
}

/**
 * Demo accounts, the shared demo password and the demo story exist only when asked for:
 * always while developing, otherwise only with DEMO=1. A real start has no accounts at all
 * until ADMIN_EMAIL and ADMIN_PASSWORD create the first one.
 */
export const DEMO = dev || process.env.DEMO === '1';
if (DEMO) seed();
else createFirstAdmin();
