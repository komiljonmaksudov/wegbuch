// Every number and name you may want to change, in one place. Change it here, nowhere else.
// Plain data: no imports, no logic. Both the rules (core) and the server use it.

// ---- Rules for requests and sick notes ----

/** The longest period one request or sick note may cover. Longer ones would make every page slow. */
export const MAX_DAYS = 366;
/** Dates outside these years are never real here. Year 9999 once crashed the server. */
export const YEAR_MIN = 2000;
export const YEAR_MAX = 2100;
/** Comments are cut to this length. */
export const COMMENT_MAX_LENGTH = 500;

// ---- Writing events ----

/** A write that meets a concurrent write reads the history and decides again. This many tries, then it gives up. */
export const MAX_WRITE_ATTEMPTS = 4;

// ---- Sessions (OWASP suggests shorter: about 30 min idle and 4 to 8 h absolute. See README, known gaps) ----

export const SESSION_COOKIE = 'session';
export const SESSION_IDLE_MS = 12 * 60 * 60 * 1000; // 12 hours without a request, then you must log in again
export const SESSION_MAX_MS = 24 * 60 * 60 * 1000; // 24 hours (1 day) after login, whatever you do
/** "Last seen" of a session is written at most this often. */
export const SESSION_TOUCH_EVERY_MS = 5 * 60 * 1000; // 5 minutes

// ---- Login ----

/** Wrong passwords per email within the window before the login is blocked. */
export const LOGIN_MAX_FAILURES = 5;
export const LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 minutes: failures older than this are forgotten, and a block ends
/** The throttle forgets the oldest email when it holds more than this many, so random emails cannot fill memory. */
export const LOGIN_THROTTLE_MAX_KEYS = 10_000;

// ---- Passwords ----

export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 200;
/** OWASP's minimum argon2id setting (19 MiB, 2 passes, 1 thread). */
export const PASSWORD_HASH = { memory: 19456, passes: 2, parallelism: 1, tagLength: 32 } as const;

// ---- Live updates ----

/** The live connection sends the counters again this often, so proxies keep it open. */
export const LIVE_KEEP_ALIVE_MS = 25_000; // 25 seconds
