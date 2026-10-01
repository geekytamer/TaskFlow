'use client';

import * as React from 'react';
import Link from 'next/link';
import { Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCompany } from '@/context/company-context';
import { useI18n } from '@/context/i18n-context';
import { listGamesOrNull } from '@/services/gamesService';

/**
 * A way into Games, shown only where they exist: the portal company, for its
 * admins. Other companies never see it, so the shared sidebar stays unchanged.
 */
export function GamesLink() {
  const { language } = useI18n();
  const { selectedCompany } = useCompany();
  const [available, setAvailable] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    setAvailable(false);
    if (!selectedCompany) return;
    listGamesOrNull(selectedCompany.id)
      .then((games) => { if (!cancelled) setAvailable(games !== null); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [selectedCompany]);

  if (!available) return null;
  return (
    <Button variant="outline" asChild>
      <Link href="/games"><Trophy className="me-1.5 h-4 w-4" />{language === 'ar' ? 'الألعاب' : 'Games'}</Link>
    </Button>
  );
}
