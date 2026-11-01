'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

/** The review page moved into the Peak Flexi section; old links (notifications) still land on it. */
function Redirect() {
  const router = useRouter();
  const id = useSearchParams().get('id');
  React.useEffect(() => {
    router.replace(id ? `/flexi/applications?id=${encodeURIComponent(id)}` : '/flexi/applications');
  }, [id, router]);
  return null;
}

export default function OldFlexiRoute() {
  return <React.Suspense fallback={null}><Redirect /></React.Suspense>;
}
