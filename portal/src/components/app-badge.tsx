'use client';

import { useEffect } from 'react';

/** Puts the number of unread threads on the installed app's icon, where the browser supports it. Renders nothing. */
export function AppBadge({ count }: { count: number }) {
  useEffect(() => {
    const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
    const done = count > 0 ? nav.setAppBadge?.(count) : nav.clearAppBadge?.();
    done?.catch(() => undefined);
  }, [count]);
  return null;
}
