import { matchesSearch, normalizeSearch } from '@/lib/search-normalize';

/** Contact fields the list's search, filters and duplicate check read. */
export interface ListContact {
  id: string;
  name: string;
  nameAr?: string | null;
  nameEn?: string | null;
  email?: string | null;
  phone?: string | null;
  contactPerson?: string | null;
  ownerUserId?: string | null;
  nextFollowupDate?: Date | string | null;
  lastActivityAt?: string | null;
  createdAt?: Date | string | null;
}

/**
 * A phone number reduced to what identifies it: digits only, without a 00/+
 * prefix or Oman's 968, so "+968 9123 4567", "0096891234567" and "91234567"
 * are the same number.
 */
export function phoneKey(phone?: string | null): string {
  let digits = (phone ?? '').replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('968') && digits.length === 11) digits = digits.slice(3);
  return digits;
}

/** Name, email, contact person, or any part of the phone number (spaces and +968 ignored). */
export function matchesContactSearch(query: string, c: ListContact): boolean {
  if (!query.trim()) return true;
  if (matchesSearch(query, c.name, c.nameAr, c.nameEn, c.email, c.contactPerson)) return true;
  const digits = query.replace(/\D/g, '');
  if (digits.length < 3 || /[^\d\s+()-]/.test(query.trim())) return false;
  // What was typed may start with the country code even when it is only part of the number.
  let wanted = digits.startsWith('00') ? digits.slice(2) : digits;
  if (wanted.startsWith('968') && wanted.length > 3) wanted = wanted.slice(3);
  return phoneKey(c.phone).includes(wanted);
}

export type DuplicateReason = 'phone' | 'email' | 'name';

/** Contacts that look like the one being added: same phone, same email, or the same name. */
export function findDuplicates(
  candidate: { name?: string; nameAr?: string; nameEn?: string; email?: string; phone?: string },
  contacts: ListContact[],
  excludeId?: string,
): Array<{ contact: ListContact; reasons: DuplicateReason[] }> {
  const phone = phoneKey(candidate.phone);
  const email = (candidate.email ?? '').trim().toLowerCase();
  const names = [candidate.name, candidate.nameAr, candidate.nameEn].map((n) => normalizeSearch(n)).filter((n) => n.length >= 3);
  const found: Array<{ contact: ListContact; reasons: DuplicateReason[] }> = [];
  for (const c of contacts) {
    if (c.id === excludeId) continue;
    const reasons: DuplicateReason[] = [];
    if (phone.length >= 7 && phoneKey(c.phone) === phone) reasons.push('phone');
    if (email && (c.email ?? '').trim().toLowerCase() === email) reasons.push('email');
    const theirs = [c.name, c.nameAr, c.nameEn].map((n) => normalizeSearch(n)).filter(Boolean);
    if (names.some((n) => theirs.includes(n))) reasons.push('name');
    if (reasons.length) found.push({ contact: c, reasons });
  }
  return found;
}

export type QuickFilter = 'all' | 'mine' | 'late' | 'quiet';

const DAY = 24 * 60 * 60 * 1000;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** Follow-up date before today. */
export function isFollowupLate(c: ListContact, today: Date = new Date()): boolean {
  if (!c.nextFollowupDate) return false;
  return startOfDay(new Date(c.nextFollowupDate)) < startOfDay(today);
}

/** Nothing logged for 30 days or more, and not added in the last 30 days either. */
export function isQuiet(c: ListContact, today: Date = new Date(), days = 30): boolean {
  const cutoff = today.getTime() - days * DAY;
  if (c.createdAt && new Date(c.createdAt).getTime() > cutoff) return false;
  return !c.lastActivityAt || new Date(c.lastActivityAt).getTime() <= cutoff;
}

export function matchesQuickFilter(filter: QuickFilter, c: ListContact, meId: string | undefined, today: Date = new Date()): boolean {
  switch (filter) {
    case 'mine': return Boolean(meId) && c.ownerUserId === meId;
    case 'late': return isFollowupLate(c, today);
    case 'quiet': return isQuiet(c, today);
    default: return true;
  }
}
