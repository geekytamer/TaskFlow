import { forwardClientWrite } from '@/lib/session-route';

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  return forwardClientWrite(request, '/referrals', body);
}
