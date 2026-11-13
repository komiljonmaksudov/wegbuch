# Wegbuch

Absence management (vacation, sick days, approvals, team calendar) for a small company. German UI, German (NRW) rules.
A prototype for a review at LOX Solutions, Cologne.

## Run it

Needs Node 24 (`nvm use`).

```sh
bun install
bun dev                 # http://localhost:5173, demo accounts and demo data are on in dev
bun run check           # types and Svelte checks
bun run test            # unit tests
ORIGIN=http://localhost:3000 bun run build   # production build (set ORIGIN to the public address)
```

The database is one SQLite file (`data/absence.db`, or `DATABASE_PATH`). Delete it and restart to get fresh demo data.

## How it is built

- **SvelteKit 3**, TypeScript. Remote functions (`*.remote.ts`) for all data and forms, Svelte `await` in components. Both are experimental.
- **Event log** (`events` table, append only). A balance is always computed from the events, never stored.
- **`src/core/constants.ts`** every limit and timeout in one file (session lifetimes, login throttle, maximum period, password length). Change them there.
- **`src/core`** pure rules and decisions, no I/O. **`src/lib/server`** the services around SQLite. Pages only show things.
- Only dependency besides the framework: `valibot` (shape checks of remote function input).
- Live updates: the server sends counters of what changed, never data. Each page reloads its own query.
- `/coming-soon` has preview videos of ideas that are not built. It is not in the navigation on purpose.

## Production notes

- Needs HTTPS. The session cookie is `Secure` outside dev, so login over plain http will not stay logged in.
- The first HR account comes from `ADMIN_EMAIL` and `ADMIN_PASSWORD`, only while the database is empty. Demo accounts only exist with `DEMO=1` (never set it on a public site).
- Keep the `data/` folder across deployments. One process only (live counters are in memory).

## Known gaps (a prototype, on purpose)

Security
- Login throttle counts per email, not per source: anyone can lock a colleague out for 15 minutes.
- One-time passwords (new person, reset) stay valid until the person changes them. No "must change" flag yet. Invite links would fix it.
- Session timeouts are lenient (12 h idle, 24 h absolute). OWASP suggests about 30 min idle and 4 to 8 h absolute. Cookie name is `session`, not `__Host-` prefixed (needs HTTPS).
- No log or alert for session events, no list of active logins, no `Clear-Site-Data` on logout.
- Only a minimal CSP (`frame-ancestors`). No `{@html}` is used, so XSS risk is low.
- A deactivated person's already open page keeps receiving the live counters (counts only, no data).
- Origin check of the remote endpoints against cross-site posts is not tested.
- No audit trail for HR actions (add, deactivate, password reset): they are not events.

Product
- Leave expiry: no logic. Under German case law leave only expires after the employer's documented notice. A notice flow is not built.
- Invite links instead of showing a password, a profile photo, SCIM and SSO are not built.
- Phone layout: the month title wraps and the names column in the calendar is too wide.

Data
- Erasing a person's data (DSGVO) is not built. Free-text comments sit inside the events, so they cannot be erased without editing the log. Plan: keep comments in their own table, and anonymise the person's row. Health data (sick leave) is extra sensitive.
- No backup. Copying the live `.db` file is not safe (WAL). Needs an online backup and a tried restore.
- No schema version (`PRAGMA user_version`) and no upcasting for changed events.
- No snapshots: a balance is computed from all events of a person on each request.
- `node:sqlite` is a release candidate (stability 1.2).
- One database for everyone. Many customers would mean one file per workspace.

Tooling
- `remoteFunctions` and Svelte `async` are experimental. Pin versions before the review.
- Safari: the painted shapes use a clip-path and a plain outline on solid buttons, because the SVG filter showed white seams. Not tested in Safari by us.
