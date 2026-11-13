// The only place that opens SQLite. One connection per database file, shared by everything that stores data
// (users, sessions, events). One connection means one set of settings and no two writers in one process.
// If node:sqlite changes, or we move to Postgres, this is the file that changes first.

import { DatabaseSync } from 'node:sqlite';

export type Db = DatabaseSync;

export function openDb(path = ':memory:'): Db {
	const db = new DatabaseSync(path);
	db.exec(`
		PRAGMA journal_mode = WAL;
		PRAGMA busy_timeout = 5000; -- another process (a backup, a second app) may hold the lock: wait, do not fail
		PRAGMA foreign_keys = ON;   -- SQLite ignores REFERENCES unless this is on
	`);
	return db;
}
