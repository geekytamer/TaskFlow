'use client';

import * as React from 'react';
import Link from 'next/link';
import { Compass } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCompany } from '@/context/company-context';
import { useI18n } from '@/context/i18n-context';
import { getDiscoverOrNull } from '@/services/discoverService';

/** The way into the Discover directory, shown only where it exists: the portal company, for those who run it. */
export function DiscoverLink() {
  const { language } = useI18n();
  const { selectedCompany } = useCompany();
  const [available, setAvailable] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    setAvailable(false);
    if (!selectedCompany) return;
    getDiscoverOrNull(selectedCompany.id, 'listed')
      .then((data) => { if (!cancelled) setAvailable(data !== null); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [selectedCompany]);

  if (!available) return null;
  return (
    <Button variant="outline" size="sm" asChild>
      <Link href="/influencers/discover"><Compass className="me-1.5 h-4 w-4" />{language === 'ar' ? 'دليل الاكتشاف' : 'Discover directory'}</Link>
    </Button>
  );
}
