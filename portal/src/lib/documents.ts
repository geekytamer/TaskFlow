import { getAudience } from './audience';
import { backendDownload } from './backend';
import { currentLang, readSessionToken } from './session';

/** Streams one client document in the visitor's language. The backend checks it is theirs. */
export async function downloadDocument(path: string): Promise<Response> {
  if (getAudience() !== 'client') return new Response(null, { status: 404 });
  const token = await readSessionToken();
  if (!token) return new Response(null, { status: 401 });
  return backendDownload('client', `${path}?lang=${await currentLang()}`, token);
}
