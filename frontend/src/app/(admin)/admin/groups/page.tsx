'use client';

/**
 * The group's own page used to live here, beside Admin → Groups. Both are one
 * page now, so this route only forwards — old links and the template page's
 * back link still land on the right group.
 */
import * as React from 'react';
import { useRouter } from 'next/navigation';

export default function AdminGroupRoute() {
  const router = useRouter();
  React.useEffect(() => {
    const group = new URLSearchParams(window.location.search).get('group');
    router.replace(`/admin?tab=groups${group ? `&group=${encodeURIComponent(group)}` : ''}`);
  }, [router]);
  return null;
}
