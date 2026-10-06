'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FlaskConical, GraduationCap, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCompany } from '@/context/company-context';
import { useI18n } from '@/context/i18n-context';
import { moduleForPath } from '@/modules/companies/lib/company-modules';
import { useAcademy } from '../academy-context';

/**
 * In a real company, a page whose module the user has not unlocked yet shows
 * which mission unlocks it instead of a page of refused requests. The server
 * refuses those requests anyway; this explains why.
 */
export function AcademyGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { inPractice, locked, progress } = useAcademy();
  const { language } = useI18n();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);
  const pageModule = pathname === '/' ? 'dashboard' : pathname ? moduleForPath(pathname) : undefined;
  if (inPractice || !pageModule || !locked.has(pageModule)) return <>{children}</>;
  const mission = progress?.missions.find((m) => m.modules.includes(pageModule));
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-24 text-center" data-testid="academy-locked">
      <Lock className="h-10 w-10 text-muted-foreground" />
      <h1 className="text-xl font-semibold">{tr('Unlock this in the Academy', 'افتح هذا من الأكاديمية')}</h1>
      <p className="text-sm text-muted-foreground" dir="auto">
        {mission
          ? tr(`Finish the "${mission.title.en}" mission in your practice company first. It takes a few minutes and nothing you do there is real.`,
              `أكمل مهمة "${mission.title.ar}" في شركتك التدريبية أولاً. تستغرق دقائق ولا شيء تفعله هناك حقيقي.`)
          : tr('Finish your Academy missions first.', 'أكمل مهام الأكاديمية أولاً.')}
      </p>
      <Button asChild><Link href="/academy"><GraduationCap className="me-2 h-4 w-4" />{tr('Go to the Academy', 'اذهب إلى الأكاديمية')}</Link></Button>
    </div>
  );
}

/** A strip across the app while the practice company is selected. */
export function PracticeBanner() {
  const { inPractice, leavePractice } = useAcademy();
  const { companies } = useCompany();
  const { language } = useI18n();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);
  if (!inPractice) return null;
  const real = companies.find((c) => !c.isTraining);
  return (
    <div className="flex items-center justify-center gap-2 bg-amber-100 px-4 py-1.5 text-sm text-amber-950 dark:bg-amber-900/50 dark:text-amber-100">
      <FlaskConical className="h-4 w-4 shrink-0" />
      <span>{tr('Practice company: nothing here is real, and nobody else sees it.', 'شركة تدريبية: لا شيء هنا حقيقي، ولا يراها أحد غيرك.')}</span>
      {real && (
        <button type="button" onClick={leavePractice} className="font-semibold underline underline-offset-2">
          {tr(`Back to ${real.name}`, `العودة إلى ${real.name}`)}
        </button>
      )}
    </div>
  );
}
