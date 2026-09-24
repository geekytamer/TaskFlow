import { NextResponse } from 'next/server';
import { parseLang } from '@/lib/i18n';
import { LANG_COOKIE } from '@/lib/session';
import { forbidden, requireSameOrigin } from '@/lib/session-route';

export async function POST(request: Request) {
  if (!requireSameOrigin(request)) return forbidden();
  const body = (await request.json().catch(() => ({}))) as { lang?: string };
  const response = NextResponse.json({ ok: true });
  response.cookies.set(LANG_COOKIE, parseLang(body.lang), {
    path: '/',
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * 365,
  });
  return response;
}
