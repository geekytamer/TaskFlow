'use client';

import { useI18n } from '@/context/i18n-context';
import { useAuthGuard } from '@/hooks/use-auth-guard';
import { GamesPage } from '@/modules/games/components/games-page';

export default function GamesRoute() {
  // The API decides who may manage games (GAMES_MANAGE); the page shows why if not.
  const { user, loading } = useAuthGuard();
  const { t } = useI18n();
  if (loading || !user) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <p className="text-muted-foreground">{t('common.loading')}</p>
      </div>
    );
  }
  return <GamesPage />;
}
