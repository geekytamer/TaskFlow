'use client';

import { useEffect } from 'react';

/** Registers the service worker that shows phone notifications. Harmless where it is not supported. */
export function PwaRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => undefined);
  }, []);
  return null;
}
