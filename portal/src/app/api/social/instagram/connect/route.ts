import { forwardWrite } from '@/lib/session-route';

export async function POST(request: Request) {
  return forwardWrite(request, '/social/instagram/connect', {}, 'influencer');
}
