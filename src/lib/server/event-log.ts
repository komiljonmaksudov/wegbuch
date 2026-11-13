// Append-only event store on node:sqlite (built in, no dependency).
// - seq: global, increasing number. A client can ask "everything after N" (sync-ready).
// - version: per stream, with UNIQUE(stream_id, version) for optimistic concurrency.
// - command_id: a retried command is a no-op (idempotent).

import type { AbsenceEvent } from '../../core/events';
import type { Db } from './db';

export type StoredEvent = AbsenceEvent & {
	seq: number;
	streamId: string;
	version: number;
	occurredAt: string;
	commandId: string;
};

export class ConcurrencyError extends Error {
	constructor(streamId: string, expected: number, actual: number) {
		super(`Stream ${streamId}: expected version ${expected}, but it is ${actual}.`);
		this.name = 'ConcurrencyError';
	}
}

type Row = {
	seq: number;
	stream_id: string;
	version: number;
	type: string;
	data: string;
	occurred_at: string;
	command_id: string;
};

function toEvent(r: Row): StoredEvent {
	return {
		type: r.type,
		data: JSON.parse(r.data),
		seq: r.seq,
		streamId: r.stream_id,
		version: r.version,
		occurredAt: r.occurred_at,
		commandId: r.command_id
	} as StoredEvent;
}

export class EventLog {
	#db: Db;
	#now: () => string;
	#listeners = new Set<(streamId: string, types: string[]) => void>();

	/** Calls `listener` after every saved write with the stream and the event types, never the data. Returns a stop function. */
	onChange(listener: (streamId: string, types: string[]) => void): () => void {
		this.#listeners.add(listener);
		return () => this.#listeners.delete(listener);
	}

	constructor(db: Db, now: () => string = () => new Date().toISOString()) {
		this.#now = now;
		this.#db = db;
		this.#db.exec(`
			CREATE TABLE IF NOT EXISTS events (
				seq         INTEGER PRIMARY KEY AUTOINCREMENT,
				stream_id   TEXT    NOT NULL,
				version     INTEGER NOT NULL,
				type        TEXT    NOT NULL,
				data        TEXT    NOT NULL,
				occurred_at TEXT    NOT NULL,
				command_id  TEXT    NOT NULL,
				UNIQUE (stream_id, version)
			) STRICT;
			CREATE TABLE IF NOT EXISTS commands (
				command_id TEXT PRIMARY KEY
			) STRICT;
		`);
	}

	/** True if a command with this id was already handled. */
	hasCommand(commandId: string): boolean {
		return !!this.#db.prepare('SELECT 1 FROM commands WHERE command_id = ?').get(commandId);
	}

	/** Current version of a stream. -1 means the stream does not exist yet. */
	version(streamId: string): number {
		const row = this.#db
			.prepare('SELECT COALESCE(MAX(version), -1) AS v FROM events WHERE stream_id = ?')
			.get(streamId) as { v: number };
		return row.v;
	}

	/**
	 * Append events to a stream. `expectedVersion` is the version you read before deciding.
	 * Throws ConcurrencyError if someone else appended in between.
	 * A command id that was already used changes nothing and returns `duplicate: true`.
	 */
	append(
		streamId: string,
		expectedVersion: number,
		commandId: string,
		events: AbsenceEvent[]
	): { version: number; duplicate: boolean } {
		this.#db.exec('BEGIN IMMEDIATE');
		try {
			const seen = this.#db.prepare('SELECT 1 FROM commands WHERE command_id = ?').get(commandId);
			if (seen) {
				const version = this.version(streamId);
				this.#db.exec('COMMIT');
				return { version, duplicate: true };
			}
			const current = this.version(streamId);
			if (current !== expectedVersion) throw new ConcurrencyError(streamId, expectedVersion, current);

			const insert = this.#db.prepare(
				'INSERT INTO events (stream_id, version, type, data, occurred_at, command_id) VALUES (?, ?, ?, ?, ?, ?)'
			);
			let version = current;
			const at = this.#now();
			for (const e of events) {
				version += 1;
				insert.run(streamId, version, e.type, JSON.stringify(e.data), at, commandId);
			}
			this.#db.prepare('INSERT INTO commands (command_id) VALUES (?)').run(commandId);
			this.#db.exec('COMMIT');
			// After the commit. A listener that fails must never undo or hide a saved write.
				for (const listener of this.#listeners) {
					try {
						listener(streamId, events.map((e) => e.type));
					} catch {
						/* a failing listener changes nothing */
					}
				}
				return { version, duplicate: false };
		} catch (err) {
			this.#db.exec('ROLLBACK');
			throw err;
		}
	}

	/** All events of one stream, oldest first. */
	read(streamId: string): StoredEvent[] {
		const rows = this.#db
			.prepare('SELECT * FROM events WHERE stream_id = ? ORDER BY version')
			.all(streamId) as Row[];
		return rows.map(toEvent);
	}

	/** Events after a global position, oldest first. This is the sync cursor. */
	readAfter(seq: number, limit = 500): StoredEvent[] {
		const rows = this.#db
			.prepare('SELECT * FROM events WHERE seq > ? ORDER BY seq LIMIT ?')
			.all(seq, limit) as Row[];
		return rows.map(toEvent);
	}

	close(): void {
		this.#db.close();
	}
}
