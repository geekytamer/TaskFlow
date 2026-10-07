'use client';

import { useEffect } from 'react';

/** Opens a conversation at its latest message, unless the address points somewhere else on the page. */
/** `latestId` changes when a message arrives or is sent, which scrolls again. */
export function ScrollToLatest({ targetId, latestId }: { targetId: string; latestId?: string }) {
  useEffect(() => {
    if (window.location.hash) return;
    document.getElementById(targetId)?.scrollIntoView({ block: 'end' });
  }, [targetId, latestId]);
  return null;
}
