import { forwardWrite } from '@/lib/session-route';

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  return forwardWrite(request, '/profile/availability', body, 'influencer');
}
