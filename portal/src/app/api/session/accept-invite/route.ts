import { startSession } from '@/lib/session-route';

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { token?: unknown; password?: unknown };
  return startSession(request, '/auth/accept-invite', { token: body.token, password: body.password });
}
