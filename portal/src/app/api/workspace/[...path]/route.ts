import { NextResponse } from 'next/server';
import { backendDownload } from '@/lib/backend';
import { forwardWrite } from '@/lib/session-route';
import { readSessionToken } from '@/lib/session';
import { getAudience } from '@/lib/audience';

/**
 * The creator workspace's writes and file downloads. Only these shapes are
 * forwarded, and only on the influencer host; there is no general proxy.
 */
const ID = '[A-Za-z0-9-]{1,64}';
const WRITES = [
  'contacts', `contacts/${ID}`, `contacts/${ID}/archive`, `contacts/${ID}/notes`,
  'deals', `deals/${ID}`, `deals/${ID}/delete`, `deals/${ID}/deliverables`, `deals/${ID}/files`,
  `deliverables/${ID}`, `deliverables/${ID}/delete`, `files/${ID}/delete`, 'settings',
].map((p) => new RegExp(`^${p}$`));
const DOWNLOAD = new RegExp(`^files/${ID}/content$`);

const notFound = () => NextResponse.json({ message: 'Not found.' }, { status: 404 });

export async function POST(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const path = (await params).path.join('/');
  if (!WRITES.some((re) => re.test(path))) return notFound();
  const body = await request.json().catch(() => ({}));
  return forwardWrite(request, `/workspace/${path}`, body, 'influencer');
}

export async function GET(_request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const path = (await params).path.join('/');
  if (getAudience() !== 'influencer' || !DOWNLOAD.test(path)) return notFound();
  const token = await readSessionToken();
  if (!token) return new Response(null, { status: 401 });
  return backendDownload('influencer', `/workspace/${path}`, token);
}
