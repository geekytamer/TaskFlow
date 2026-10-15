import { HttpError } from '../http';

export interface ConversationSettings {
  responseTargetHours: number;
  /** 0 = Sunday. */
  workDays: number[];
  dayStart: string;
  dayEnd: string;
  timeZone: string;
}

export const DEFAULT_CONVERSATION_SETTINGS: ConversationSettings = {
  responseTargetHours: 4,
  workDays: [0, 1, 2, 3, 4],
  dayStart: '08:00',
  dayEnd: '17:00',
  timeZone: 'Asia/Muscat',
};

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;
/** Amber from half of the target, red once past it. */
const AMBER_AT = 0.5;
/** Never loop past a year of days looking for working time. */
const MAX_DAYS = 400;

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

/** Wall-clock time in the zone, read as if it were UTC (so differences give the zone's offset). */
function wallAsUtc(ms: number, timeZone: string): number {
  const p: Record<string, number> = {};
  for (const part of formatter(timeZone).formatToParts(new Date(ms))) if (part.type !== 'literal') p[part.type] = Number(part.value);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
}

/** The instant at which the zone's wall clock reads this local date and time. */
function instantOf(localMidnightUtc: number, hhmm: string, timeZone: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  const wall = localMidnightUtc + (h * 60 + m) * 60_000;
  let guess = wall;
  for (let i = 0; i < 3; i += 1) guess = wall - (wallAsUtc(guess, timeZone) - guess);
  return guess;
}

/** Working windows (UTC ms) starting on the local day of `fromMs`, one per working day, in order. */
function* windows(fromMs: number, s: ConversationSettings): Generator<[number, number]> {
  const local = wallAsUtc(fromMs, s.timeZone);
  let day = local - (((local % DAY_MS) + DAY_MS) % DAY_MS);
  for (let i = 0; i < MAX_DAYS; i += 1, day += DAY_MS) {
    if (!s.workDays.includes(new Date(day).getUTCDay())) continue;
    yield [instantOf(day, s.dayStart, s.timeZone), instantOf(day, s.dayEnd, s.timeZone)];
  }
}

/** The moment `hours` of working time after `startIso`. */
export function addWorkingHours(startIso: string, hours: number, s: ConversationSettings): string {
  const start = Date.parse(startIso);
  let remaining = hours * HOUR_MS;
  for (const [open, close] of windows(start, s)) {
    const from = Math.max(start, open);
    if (from >= close) continue;
    if (remaining <= close - from) return new Date(from + remaining).toISOString();
    remaining -= close - from;
  }
  return new Date(start + hours * HOUR_MS).toISOString();
}

/** Working hours that fall between two instants. */
export function workingHoursBetween(startIso: string, endIso: string, s: ConversationSettings): number {
  const start = Date.parse(startIso);
  const end = Date.parse(endIso);
  if (!(end > start)) return 0;
  let total = 0;
  for (const [open, close] of windows(start, s)) {
    if (open >= end) break;
    const overlap = Math.min(end, close) - Math.max(start, open);
    if (overlap > 0) total += overlap;
  }
  return total / HOUR_MS;
}

export type SlaLevel = 'ok' | 'amber' | 'red';

export function slaOf(waitingSince: string | null, nowIso: string, s: ConversationSettings): { dueAt: string; level: SlaLevel } | null {
  if (!waitingSince) return null;
  const elapsed = workingHoursBetween(waitingSince, nowIso, s);
  const level: SlaLevel = elapsed > s.responseTargetHours ? 'red' : elapsed >= s.responseTargetHours * AMBER_AT ? 'amber' : 'ok';
  return { dueAt: addWorkingHours(waitingSince, s.responseTargetHours, s), level };
}

/** Validates a settings body; throws 400 on the first problem. */
export function parseConversationSettings(raw: Record<string, unknown>): ConversationSettings {
  const target = raw.responseTargetHours;
  if (typeof target !== 'number' || !Number.isFinite(target) || target < 0.5 || target > 72) {
    throw new HttpError(400, 'responseTargetHours must be between 0.5 and 72.');
  }
  const days = raw.workDays;
  if (!Array.isArray(days) || !days.length || days.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) {
    throw new HttpError(400, 'workDays must be a non-empty list of days from 0 (Sunday) to 6.');
  }
  const { dayStart, dayEnd, timeZone } = raw;
  if (typeof dayStart !== 'string' || typeof dayEnd !== 'string' || !HHMM.test(dayStart) || !HHMM.test(dayEnd)) {
    throw new HttpError(400, 'dayStart and dayEnd must be HH:MM.');
  }
  if (dayStart >= dayEnd) throw new HttpError(400, 'dayStart must be before dayEnd.');
  if (typeof timeZone !== 'string' || !timeZone) throw new HttpError(400, 'timeZone is not recognised.');
  try { new Intl.DateTimeFormat('en-US', { timeZone }); } catch { throw new HttpError(400, 'timeZone is not recognised.'); }
  return { responseTargetHours: target, workDays: [...new Set(days as number[])].sort((a, b) => a - b), dayStart, dayEnd, timeZone };
}
