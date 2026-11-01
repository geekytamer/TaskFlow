'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

/** Client requests moved into the Peak Flexi section; old links (notifications) still land on the request. */
function Redirect() {
  const router = useRouter();
  const open = useSearchParams().get('open');
  React.useEffect(() => {
    router.replace(open ? `/flexi/requests?open=${encodeURIComponent(open)}` : '/flexi/requests');
  }, [open, router]);
  return null;
}

export default function OldClientRequestsRoute() {
  return <React.Suspense fallback={null}><Redirect /></React.Suspense>;
}
