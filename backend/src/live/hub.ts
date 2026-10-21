import type { Response } from 'express';

/**
 * Live updates: open screens learn that something changed and fetch it again.
 * An event names topics only ("tasks", "conversation-threads"), never data:
 * each screen re-reads through the normal, permission-checked routes, so a
 * signal can never show anyone something they could not already see.
 */
export interface LiveEvent {
  topics: string[];
  /** Everyone with access to this company hears it... */
  companyId?: string;
  /** ...or only these people (a staff chat's members, a notification's recipients). */
  userIds?: string[];
}

interface LiveClient {
  userId: string;
  companyIds: Set<string>;
  res: Response;
}

/** Keeps proxies (nginx closes idle upstreams after 60s) and phones from dropping the stream. */
export const HEARTBEAT_MS = 25_000;
/** One person rarely has more tabs open than this; beyond it the oldest stream closes. */
const MAX_STREAMS_PER_USER = 8;

export class LiveHub {
  private clients = new Set<LiveClient>();

  /** Starts a stream on `res` for this person; returns how to stop it. */
  open(res: Response, userId: string, companyIds: string[]): () => void {
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    // nginx buffers proxied responses unless told not to; buffered, nothing would arrive live.
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    res.write('retry: 3000\n\n');

    const mine = [...this.clients].filter((c) => c.userId === userId);
    if (mine.length >= MAX_STREAMS_PER_USER) {
      const oldest = mine[0];
      this.clients.delete(oldest);
      oldest.res.end();
    }

    const client: LiveClient = { userId, companyIds: new Set(companyIds), res };
    this.clients.add(client);
    const heartbeat = setInterval(() => res.write(': ping\n\n'), HEARTBEAT_MS);
    heartbeat.unref?.();
    let closed = false;
    return () => {
      if (closed) return;
      closed = true;
      clearInterval(heartbeat);
      this.clients.delete(client);
    };
  }

  publish(event: LiveEvent): void {
    const topics = [...new Set(event.topics)].filter(Boolean);
    if (topics.length === 0 || (!event.companyId && !event.userIds?.length)) return;
    const data = `data: ${JSON.stringify({ topics, companyId: event.companyId ?? null })}\n\n`;
    for (const client of this.clients) {
      const hears = event.userIds?.length
        ? event.userIds.includes(client.userId)
        : client.companyIds.has(event.companyId!);
      if (!hears) continue;
      try {
        client.res.write(data);
      } catch {
        this.clients.delete(client);
      }
    }
  }

  /** Streams open right now (tests and the health page). */
  get size(): number {
    return this.clients.size;
  }
}

/**
 * The topics a successful change touches, read from its path:
 * POST /companies/1/sales-orders/9/confirm -> ["sales-orders", "confirm"].
 * Ids and numbers are left out; an extra topic only costs a re-read.
 */
export function topicsFromPath(path: string): { companyId?: string; topics: string[] } {
  const clean = path.split('?')[0];
  const match = /^\/companies\/([^/]+)(\/.*)?$/.exec(clean);
  const companyId = match ? decodeURIComponent(match[1]) : undefined;
  const rest = match ? match[2] ?? '' : clean;
  const topics = rest
    .split('/')
    .filter((segment) => /^[a-z][a-z-]*[a-z]$/.test(segment));
  return { companyId, topics: topics.length ? topics : match ? ['company'] : [] };
}
