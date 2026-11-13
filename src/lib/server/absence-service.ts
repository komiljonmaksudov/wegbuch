// The one place that changes data. Every screen, and later every bot, goes through here.
// Steps: check who may do it, read the stream, let the pure rules decide, append with the version we read.
// If someone else appended in between, read again and decide again (so the rules see the new truth).

import {
	decideCancel,
	decideDecision,
	decideRequest,
	decideSick,
	fail,
	ok,
	overlappingAbsences,
	type Result
} from '../../core/decide';
import { absences, calculateBalance, type AbsenceEvent, type Balance } from '../../core/events';
import type { IsoDate } from '../../core/rules-de-nrw';
import type { Auth, User } from './auth';
import { MAX_WRITE_ATTEMPTS } from '../../core/constants';
import { ConcurrencyError, type EventLog } from './event-log';

export const streamOf = (employeeId: string) => `Employee-${employeeId}`;

// 'absent' is how everyone except HR sees a sick period. The word "sick" never leaves the server for them.
export type Away = { employeeId: string; name: string; from: IsoDate; to: IsoDate; kind: 'vacation' | 'open' | 'sick' | 'absent' };

export class AbsenceService {
	#store: EventLog;
	#auth: Auth;
	#today: () => IsoDate;

	constructor(store: EventLog, auth: Auth, today: () => IsoDate) {
		this.#store = store;
		this.#auth = auth;
		this.#today = today;
	}

	today(): IsoDate {
		return this.#today();
	}

	// ---- reading ----

	balance(employeeId: string): Balance {
		return calculateBalance(this.#store.read(streamOf(employeeId)));
	}

	/** Teammates (same manager, not the person) who are away during a period. */
	teamAway(actor: User, from: IsoDate, to: IsoDate): Away[] {
		if (!actor.managerId) return [];
		const mates = this.#auth.listUsers().filter((u) => u.managerId === actor.managerId && u.id !== actor.id);
		const team = mates.map((u) => ({
			employeeId: u.id,
			absences: absences(this.#store.read(streamOf(u.id)))
		}));
		const names = new Map(mates.map((u) => [u.id, u.name]));
		return overlappingAbsences({ from, to }, team)
			.filter((a) => a.kind !== 'open') // other people's open requests are private until decided
			.map((a) => ({
				...a,
				kind: a.kind === 'sick' && actor.role !== 'hr' ? ('absent' as const) : a.kind,
				name: names.get(a.employeeId) ?? a.employeeId
			}));
	}

	// ---- writing ----

	requestVacation(actor: User, commandId: string, input: { from: IsoDate; to: IsoDate; comment?: string }) {
		const requestId = `r-${commandId}`; // the same command always gives the same request
		const result = this.#run(actor.id, actor.id, commandId, (events) =>
			decideRequest(events, { ...input, requestId }, this.#today())
		);
		if (!result.ok) return result;
		const request = this.balance(actor.id).requests.find((r) => r.requestId === requestId);
		return ok({
			requestId,
			days: request?.days ?? 0,
			duplicate: result.value.duplicate,
			away: this.teamAway(actor, input.from, input.to)
		});
	}

	/** A lead decides for their own team. HR decides for anyone. Nobody decides their own request. */
	decide(
		actor: User,
		commandId: string,
		input: { employeeId: string; requestId: string; approve: boolean; comment?: string }
	) {
		const employee = this.#auth.getUser(input.employeeId);
		if (!employee) return fail('unknown_user', 'Diese Person gibt es nicht.');
		if (actor.id === employee.id) return fail('forbidden', 'Eigene Anträge kannst du nicht selbst entscheiden.');
		const allowed = actor.role === 'hr' || (actor.role === 'lead' && employee.managerId === actor.id);
		if (!allowed) return fail('forbidden', 'Dazu fehlt dir die Berechtigung.');

		return this.#run(actor.id, employee.id, commandId, (events) =>
			decideDecision(events, { requestId: input.requestId, approve: input.approve, by: actor.id, comment: input.comment })
		);
	}

	cancel(actor: User, commandId: string, input: { requestId: string }) {
		return this.#run(actor.id, actor.id, commandId, (events) => decideCancel(events, input, this.#today()));
	}

	reportSick(actor: User, commandId: string, input: { from: IsoDate; to: IsoDate }) {
		return this.#run(actor.id, actor.id, commandId, () => decideSick(input, this.#today()));
	}

	// ---- the loop ----

	#run(
		actorId: string,
		employeeId: string,
		clientCommandId: string,
		decide: (events: AbsenceEvent[]) => Result<{ events: AbsenceEvent[] }>
	): Result<{ duplicate: boolean }> {
		// The browser picks the id, so it cannot be trusted to be unique across people. Someone could use
		// the id another screen will send, and that command would then be thrown away as a "repeat".
		// Keeping ids per person means you can only ever repeat your own commands.
		const commandId = `${actorId}|${clientCommandId}`;

		// A repeated command (a double click, a retry) must not run the rules again:
		// the first run already changed the balance, so the rules could now say no.
		if (this.#store.hasCommand(commandId)) return ok({ duplicate: true });

		const streamId = streamOf(employeeId);
		for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt++) {
			const stored = this.#store.read(streamId);
			const version = stored.length ? stored[stored.length - 1].version : -1;
			const decision = decide(stored);
			if (!decision.ok) return decision;
			try {
				const { duplicate } = this.#store.append(streamId, version, commandId, decision.value.events);
				return ok({ duplicate });
			} catch (e) {
				if (e instanceof ConcurrencyError) continue; // someone wrote in between: read and decide again
				throw e;
			}
		}
		return fail('conflict', 'Die Daten haben sich gleichzeitig geändert. Bitte versuche es noch einmal.');
	}
}
