// Live updates without data. This module only counts "something of this kind changed".
// A browser compares the counters with the ones it saw and reloads just that part of the page.
// The counters never hold names, dates or the word "sick". The reload goes through the normal
// load functions, so every privacy rule applies as before.

import { LIVE_KEEP_ALIVE_MS } from '../../core/constants';
import type { EventLog } from './event-log';

export type Topics = {
	/** Any absence changed. The calendar shows "abwesend" to everyone, so this tells nobody anything new. */
	calendar: number;
	/** A vacation request came, was decided or was cancelled. Leads and HR reload their open requests. */
	approvals: number;
	/** The person's own entries changed (own requests, sick days, allowance). */
	mine: number;
	/** The history ledger changed. Only HR reads it. */
	history: number;
	/** A person was added, changed, deactivated or got a new password. Only HR reads the list. */
	people: number;
};

const REQUEST_TYPES = new Set(['VacationRequested', 'VacationApproved', 'VacationRejected', 'VacationCancelled']);
const ABSENCE_TYPES = new Set([...REQUEST_TYPES, 'SickReported']);

export class Live {
	#calendar = 0;
	#approvals = 0;
	#history = 0;
	#people = 0;
	#mine = new Map<string, number>();
	#waiting = new Set<() => void>();

	constructor(log: EventLog) {
		log.onChange((streamId, types) => this.#changed(streamId, types));
	}

	#changed(streamId: string, types: string[]) {
		const person = streamId.replace(/^Employee-/, '');
		this.#mine.set(person, (this.#mine.get(person) ?? 0) + 1);
		this.#history++;
		if (types.some((t) => ABSENCE_TYPES.has(t))) this.#calendar++;
		if (types.some((t) => REQUEST_TYPES.has(t))) this.#approvals++;
		this.poke();
	}

	/** A person changed. That is not an event, so the people screens call this themselves. */
	bumpPeople() {
		this.#people++;
		this.poke();
	}

	/** Wake every open stream. Also used when something changes that is not an event, like a new person. */
	poke() {
		for (const wake of this.#waiting) wake();
	}

	topicsFor(userId: string): Topics {
		return { calendar: this.#calendar, approvals: this.#approvals, history: this.#history, people: this.#people, mine: this.#mine.get(userId) ?? 0 };
	}

	/**
	 * The counters now, then again after each change. Sends the same counters every 25 s so that
	 * proxies keep the connection open. Stops when `signal` aborts (the browser went away).
	 */
	async *stream(userId: string, signal?: AbortSignal, keepAliveMs = LIVE_KEEP_ALIVE_MS): AsyncGenerator<Topics> {
		while (!signal?.aborted) {
			yield this.topicsFor(userId);
			await new Promise<void>((resolve) => {
				const done = () => {
					clearTimeout(timer);
					this.#waiting.delete(done);
					signal?.removeEventListener('abort', done);
					resolve();
				};
				const timer = setTimeout(done, keepAliveMs);
				this.#waiting.add(done);
				signal?.addEventListener('abort', done);
			});
		}
	}
}
