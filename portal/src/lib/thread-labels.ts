/** Browser safe. The words a thread list and a thread page put on screen. */
import { formatDate } from './format';
import { t, type Lang } from './i18n';

export interface AuthorInfo { kind: 'you' | 'client' | 'team'; name: string | null; company?: string | null }

/** The General thread is stored as "General"; every reader sees it in their own language. */
export const threadTitle = (subject: string, lang: Lang) => (subject === 'General' ? t(lang, 'msg.general') : subject);

/** Team: "Name · Company". You: "You". A colleague: their name. */
export function authorLine(author: AuthorInfo, lang: Lang): string {
  if (author.kind === 'you') return t(lang, 'msg.you');
  if (author.kind === 'client') return author.name ?? t(lang, 'msg.colleague');
  const name = author.name ?? t(lang, 'msg.team');
  return author.company ? `${name} · ${author.company}` : name;
}

export function previewLine(last: { body: string; authorKind: 'you' | 'client' | 'team' } | null, lang: Lang): string {
  if (!last) return '';
  return last.authorKind === 'you' ? `${t(lang, 'msg.you')}: ${last.body}` : last.body;
}

const WEEK_MS = 7 * 86_400_000;

/** "now", "5 hr. ago", "2 days ago"; older than a week it is the date. */
export function relativeTime(iso: string | null, nowMs: number, lang: Lang): string {
  if (!iso) return '';
  const ago = nowMs - Date.parse(iso);
  if (ago >= WEEK_MS) return formatDate(iso, lang);
  const rtf = new Intl.RelativeTimeFormat(lang === 'ar' ? 'ar-OM-u-nu-latn' : 'en-GB', { numeric: 'auto', style: 'short' });
  const minutes = Math.floor(ago / 60_000);
  if (minutes < 1) return rtf.format(0, 'second');
  if (minutes < 60) return rtf.format(-minutes, 'minute');
  if (minutes < 1440) return rtf.format(-Math.floor(minutes / 60), 'hour');
  return rtf.format(-Math.floor(minutes / 1440), 'day');
}
