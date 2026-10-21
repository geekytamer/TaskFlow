'use client';

import * as React from 'react';
import { API_BASE_URL, getStoredToken } from '@/lib/api-client';

/**
 * Live updates. One stream per open app (GET /live) says which topics changed
 * in the company ("tasks", "conversation-threads", "team-chat"...); screens that
 * show those topics fetch again. The stream carries names only, never data.
 *
 * While the stream is down (offline, phone asleep), screens catch up when the
 * app comes back to the front, and once a minute meanwhile.
 */
export const LIVE_EVENT = 'taskflow:live';
export type LiveDetail = { topics: string[]; all?: boolean };

const announce = (detail: LiveDetail) => window.dispatchEvent(new CustomEvent<LiveDetail>(LIVE_EVENT, { detail }));
const catchUp = () => announce({ topics: [], all: true });

let started = false;
let connected = false;
let controller: AbortController | null = null;
let retryMs = 1000;
let retryTimer: number | undefined;

async function connect() {
  window.clearTimeout(retryTimer);
  controller?.abort();
  const token = getStoredToken();
  if (!token) return;
  const mine = new AbortController();
  controller = mine;
  try {
    const res = await fetch(`${API_BASE_URL}/live`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream' },
      signal: mine.signal,
      cache: 'no-store',
    });
    if (!res.ok || !res.body) throw new Error(`live ${res.status}`);
    // Reconnecting after a gap: whatever changed meanwhile was missed, so look again.
    if (retryMs > 1000) catchUp();
    connected = true;
    retryMs = 1000;
    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += value;
      let at;
      while ((at = buffer.indexOf('\n\n')) >= 0) {
        const block = buffer.slice(0, at);
        buffer = buffer.slice(at + 2);
        const line = block.split('\n').find((l) => l.startsWith('data: '));
        if (!line) continue;
        try {
          const event = JSON.parse(line.slice(6)) as { topics?: string[] };
          if (Array.isArray(event.topics)) announce({ topics: event.topics });
        } catch { /* a malformed line is skipped */ }
      }
    }
  } catch {
    // Aborted on purpose, offline, or the server restarted: fall through to retry.
  } finally {
    if (controller === mine) {
      connected = false;
      controller = null;
      if (!mine.signal.aborted && getStoredToken()) {
        retryTimer = window.setTimeout(connect, retryMs);
        retryMs = Math.min(retryMs * 2, 30_000);
      }
    }
  }
}

/** Starts the stream once for the whole app; safe to call from every layout. */
export function startLive() {
  if (started || typeof window === 'undefined') return;
  started = true;
  void connect();
  const wake = () => {
    if (document.visibilityState !== 'visible') return;
    // Back in front: the stream may have died while the phone slept.
    if (!connected) {
      retryMs = 2000;
      void connect();
    }
    catchUp();
  };
  document.addEventListener('visibilitychange', wake);
  window.addEventListener('online', wake);
  window.addEventListener('taskflow-token-changed', () => {
    retryMs = 1000;
    void connect();
  });
  window.setInterval(() => {
    if (!connected && document.visibilityState === 'visible') catchUp();
  }, 60_000);
}

/**
 * Calls `refresh` when one of `topics` changes (or `'*'` for any), at most once
 * per burst, and not while the app is in the background: it catches up on return.
 */
export function useLiveRefresh(topics: string[] | '*', refresh: () => unknown, enabled = true) {
  const latest = React.useRef(refresh);
  latest.current = refresh;
  const key = topics === '*' ? '*' : topics.join('|');
  React.useEffect(() => {
    if (!enabled) return;
    const wanted = key === '*' ? null : new Set(key.split('|'));
    let timer: number | undefined;
    const on = (e: Event) => {
      const detail = (e as CustomEvent<LiveDetail>).detail;
      if (!detail) return;
      if (!detail.all && wanted && !detail.topics.some((t) => wanted.has(t))) return;
      if (document.visibilityState !== 'visible') return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void latest.current(), 300);
    };
    window.addEventListener(LIVE_EVENT, on);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener(LIVE_EVENT, on);
    };
  }, [key, enabled]);
}
