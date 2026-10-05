import { PageSkeleton } from '@/components/page-skeleton';
import { t } from '@/lib/i18n';
import { currentLang } from '@/lib/session';

export default async function Loading() {
  return <PageSkeleton label={t(await currentLang(), 'state.loading')} />;
}
