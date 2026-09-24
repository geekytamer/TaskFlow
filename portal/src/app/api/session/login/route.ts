import { startSession } from '@/lib/session-route';

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { email?: unknown; password?: unknown };
  return startSession(request, '/auth/login', { email: body.email, password: body.password });
}
