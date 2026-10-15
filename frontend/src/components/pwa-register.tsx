'use client';

import { useEffect } from 'react';
import { API_BASE_URL } from '@/lib/api-client';

/**
 * Registers the service worker that shows phone notifications. Harmless where it
 * is not supported. The API base rides on the script URL so the worker's
 * "Mark done" button knows where to post; the scope stays '/', so an existing
 * registration (and its push subscription) is updated in place, not replaced.
 */
export function PwaRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register(`/sw.js?api=${encodeURIComponent(API_BASE_URL)}`, { scope: '/' }).catch(() => undefined);
  }, []);
  return null;
}
