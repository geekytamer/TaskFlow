import { cookies } from 'next/headers';
import { parseLang, type Lang } from './i18n';

export const SESSION_COOKIE = 'portal_session';
export const LANG_COOKIE = 'portal_lang';

export async function readSessionToken(): Promise<string | undefined> {
  return (await cookies()).get(SESSION_COOKIE)?.value;
}

export async function currentLang(): Promise<Lang> {
  return parseLang((await cookies()).get(LANG_COOKIE)?.value);
}

/** httpOnly keeps the token away from page scripts; Lax keeps it off cross-site requests. */
export const sessionCookie = (expires: Date) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  expires,
});
