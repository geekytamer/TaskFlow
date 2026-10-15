/**
 * Browser safe. Splits free text (a client's brief) into text and http(s)
 * links so pasted addresses can be clicked. Nothing else becomes a link: no
 * other scheme, no bare "www.", nothing the URL parser rejects.
 */
export type TextPart = { kind: 'text'; text: string } | { kind: 'link'; text: string; href: string };

const CANDIDATE = /https?:\/\/[^\s<>"'`]+/gi;
/** Sentence punctuation that usually ends a sentence rather than an address (Latin and Arabic). */
const TRAILING = /[.,;:!?'"،؛؟…]$/;
const PAIRS: Record<string, string> = { ')': '(', ']': '[', '}': '{' };

/** Drops trailing punctuation, and a closing bracket the address never opened. */
function trimEnd(url: string): string {
  let out = url;
  for (;;) {
    const last = out.slice(-1);
    if (TRAILING.test(last)) { out = out.slice(0, -1); continue; }
    const open = PAIRS[last];
    if (open && out.split(open).length - 1 < out.split(last).length - 1) { out = out.slice(0, -1); continue; }
    return out;
  }
}

function safeHref(candidate: string): string | null {
  try {
    const url = new URL(candidate);
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.hostname ? url.toString() : null;
  } catch {
    return null;
  }
}

export function linkify(text: string): TextPart[] {
  const parts: TextPart[] = [];
  let cursor = 0;
  const push = (t: string) => {
    if (!t) return;
    const prev = parts[parts.length - 1];
    if (prev?.kind === 'text') prev.text += t;
    else parts.push({ kind: 'text', text: t });
  };
  for (const match of text.matchAll(CANDIDATE)) {
    const start = match.index ?? 0;
    const url = trimEnd(match[0]);
    const href = safeHref(url);
    if (!href) continue;
    push(text.slice(cursor, start));
    parts.push({ kind: 'link', text: url, href });
    cursor = start + url.length;
  }
  push(text.slice(cursor));
  return parts;
}
