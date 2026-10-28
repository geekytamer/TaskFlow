import { NextResponse } from 'next/server';
import { getAudience } from '@/lib/audience';
import { publicPost } from '@/lib/backend';
import { requireSameOrigin, forbidden } from '@/lib/session-route';

/**
 * The join page's form. Same-origin only, client portal only, and at most
 * five sends an hour from one address (kept in memory: one portal process).
 * The backend caps the endpoint as a whole on top of this.
 */
const WINDOW_MS = 60 * 60 * 1000;
const LIMIT = 5;
const recent = new Map<string, number[]>();

function allowed(address: string): boolean {
  const now = Date.now();
  const hits = (recent.get(address) ?? []).filter((at) => now - at < WINDOW_MS);
  if (hits.length >= LIMIT) { recent.set(address, hits); return false; }
  hits.push(now);
  recent.set(address, hits);
  if (recent.size > 5000) for (const [key, list] of recent) if (list.every((at) => now - at >= WINDOW_MS)) recent.delete(key);
  return true;
}

export async function POST(request: Request) {
  if (!requireSameOrigin(request)) return forbidden();
  if (getAudience() !== 'client') return NextResponse.json({ message: 'Not found.' }, { status: 404 });
  const address = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (!allowed(address)) return NextResponse.json({ message: 'Too many requests.' }, { status: 429 });
  const body = await request.json().catch(() => ({}));
  const result = await publicPost('/join', body);
  return NextResponse.json(result.data, { status: result.status });
}
