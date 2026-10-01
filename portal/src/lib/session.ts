import { cookies } from 'next/headers';
import { getAudience } from './audience';
import { parseLang, type Lang } from './i18n';

/**
 * One cookie per audience. Cookies are scoped by host, not port, so on a shared
 * host (local development, a staging box) one portal's sign-in would otherwise
 * replace the other's session.
 */
export const sessionCookieName = () => `portal_session_${getAudience()}`;
export const LANG_COOKIE = 'portal_lang';

export async function readSessionToken(): Promise<string | undefined> {
  return (await cookies()).get(sessionCookieName())?.value;
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
