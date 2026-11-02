/**
 * Assignment windows in the company's own time (M-1).
 *
 * A date-only start ('2026-12-31') begins at the start of that day, and a
 * date-only end runs through the end of that day ("until 31 Dec" includes 31
 * Dec), both in the company's time zone: conversation settings' timeZone,
 * default Asia/Muscat. A date-time is an instant and is taken as given. Dates
 * are stored as given; only their reading changes.
 */
export const DEFAULT_TIME_ZONE = 'Asia/Muscat';

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 24 * 60 * 60 * 1000;

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric',
    });
    formatters.set(timeZone, f);
  }
  return f;
}

/** The zone's wall clock at `ms`, read as if it were UTC. */
function wallAsUtc(ms: number, timeZone: string): number {
  const p: Record<string, number> = {};
  for (const part of formatter(timeZone).formatToParts(new Date(ms))) if (part.type !== 'literal') p[part.type] = Number(part.value);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour === 24 ? 0 : p.hour, p.minute, p.second);
}

/** The instant the zone's clock reads midnight of the given UTC-midnight date. */
function zoneMidnight(utcMidnight: number, timeZone: string): number {
  let guess = utcMidnight;
  for (let i = 0; i < 3; i += 1) guess = utcMidnight - (wallAsUtc(guess, timeZone) - guess);
  return guess;
}

const safeZone = (timeZone: string | null | undefined): string => {
  if (!timeZone) return DEFAULT_TIME_ZONE;
  try {
    formatter(timeZone);
    return timeZone;
  } catch {
    return DEFAULT_TIME_ZONE;
  }
};

/**
 * The instant a window boundary stands for: null = open, NaN = unparseable
 * (the window then fails closed). `end` of a date-only value is the start of
 * the next day in the zone (the window holds while now < end).
 */
export function boundaryOf(value: string | null | undefined, kind: 'start' | 'end', timeZone?: string | null): number | null {
  if (value === null || value === undefined || value === '') return null;
  const m = DATE_ONLY.exec(value);
  if (!m) return Date.parse(value);
  const day = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (Number.isNaN(day)) return NaN;
  return zoneMidnight(kind === 'end' ? day + DAY_MS : day, safeZone(timeZone));
}

/** Whether a start/end window holds at `now` in the zone; an unparseable date makes it inactive. */
export function windowHolds(startsAt: string | null, endsAt: string | null, now: number, timeZone?: string | null): boolean {
  const start = boundaryOf(startsAt, 'start', timeZone);
  const end = boundaryOf(endsAt, 'end', timeZone);
  if (Number.isNaN(start) || Number.isNaN(end)) return false;
  return (start === null || start <= now) && (end === null || now < end);
}
