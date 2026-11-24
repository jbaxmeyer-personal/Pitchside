/** Calendar helpers. All match times are set in US Central time. */
export const TZ = 'America/Chicago';
const DAY = 86_400_000;
const WEEK = 7 * DAY;

const fmt = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short',
});

export interface LocalParts { y: number; m: number; d: number; h: number; min: number; weekday: number }

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function localParts(t: Date): LocalParts {
  const p = Object.fromEntries(fmt.formatToParts(t).map((x) => [x.type, x.value]));
  return {
    y: Number(p.year), m: Number(p.month), d: Number(p.day), h: Number(p.hour), min: Number(p.minute),
    weekday: WEEKDAYS.indexOf(String(p.weekday)),
  };
}

function offsetMs(t: number): number {
  const p = localParts(new Date(t));
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.min) - Math.floor(t / 60_000) * 60_000;
}

/** A wall-clock time in Chicago as a real instant, DST included. */
export function chicago(y: number, m: number, d: number, h = 0, min = 0): Date {
  const guess = Date.UTC(y, m - 1, d, h, min);
  let t = guess - offsetMs(guess);
  t = guess - offsetMs(t);
  return new Date(t);
}

/** Midnight Chicago time on the next Monday after the given instant. */
export function nextMonday(t: Date): Date {
  const p = localParts(t);
  const add = p.weekday === 1 ? 7 : (8 - p.weekday) % 7;
  const base = new Date(Date.UTC(p.y, p.m - 1, p.d) + add * DAY);
  return chicago(base.getUTCFullYear(), base.getUTCMonth() + 1, base.getUTCDate());
}

/** Day `dow` (0 Sunday ... 6 Saturday) of season week `week` (1-based) at h:min Chicago time. */
export function seasonTime(seasonStart: Date, week: number, dow: number, h: number, min = 0): Date {
  const p = localParts(seasonStart);
  const daysFromMonday = dow === 0 ? 6 : dow - 1;
  const base = new Date(Date.UTC(p.y, p.m - 1, p.d) + (week - 1) * WEEK + daysFromMonday * DAY);
  return chicago(base.getUTCFullYear(), base.getUTCMonth() + 1, base.getUTCDate(), h, min);
}

export const SEASON_WEEKS = 16;
export const LEAGUE_DOW = 0; // Sunday
export const LEAGUE_HOUR = 14;
export const CUP_DOW = 3; // Wednesday
export const CUP_HOUR = 19;

export function seasonEnd(seasonStart: Date): Date {
  return seasonTime(seasonStart, SEASON_WEEKS + 1, 1, 0);
}
