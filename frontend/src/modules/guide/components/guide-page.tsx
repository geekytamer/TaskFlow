'use client';

import * as React from 'react';
import { useTour, useSeenTours, SEEN_KEY, TOURS_CHANGED_EVENT } from '@/components/tutorial/tour-context';
import { TOURS, TOUR_CATEGORIES, tourAllowsRole, type Tour } from '@/components/tutorial/tour-steps';
import { useCompany } from '@/context/company-context';
import { useI18n } from '@/context/i18n-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { CheckCircle2, Play, Search, RotateCcw, Compass } from 'lucide-react';

/**
 * The guide, as a page rather than a dropdown. A dropdown could only ever list
 * tour names; with 38 tours across the whole system that is a wall of text with
 * no sense of what belongs together or what you have already done. Here they are
 * grouped the way the sidebar is, searchable, and each card says how long it is
 * and whether you have seen it.
 */
export function GuidePage() {
  const { startTour } = useTour();
  const seenTours = useSeenTours();
  const { language: locale, isRtl } = useI18n();
  const { currentRole } = useCompany();
  const [query, setQuery] = React.useState('');

  // Only tours whose page this role can actually open. Offering a walkthrough
  // that bounces the user out at the first step is worse than not offering it.
  const availableTours = React.useMemo(
    () => TOURS.filter((tour) => tourAllowsRole(tour, currentRole)),
    [currentRole],
  );

  const tr = (en: string, ar: string) => (locale === 'ar' ? ar : en);
  const name = (tour: Tour) => (locale === 'ar' ? tour.ar : tour.en);

  const matches = React.useCallback(
    (tour: Tour) => {
      const q = query.trim().toLowerCase();
      if (!q) return true;
      const haystack = [
        tour.en,
        tour.ar,
        tour.route ?? '',
        // Step titles and bodies too, so searching "VAT" or "weighted average"
        // finds the tour that explains it even when the tour is named something
        // else entirely.
        ...tour.steps.flatMap((s) => [s.en.title, s.ar.title, s.en.desc, s.ar.desc]),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    },
    [query],
  );

  const grouped = React.useMemo(
    () =>
      TOUR_CATEGORIES.map((category) => ({
        category,
        tours: availableTours.filter((t) => (t.category ?? 'start') === category.id && matches(t)),
      })).filter((group) => group.tours.length > 0),
    [availableTours, matches],
  );

  const totalSteps = availableTours.reduce((sum, t) => sum + t.steps.length, 0);
  const completed = availableTours.filter((t) => seenTours.includes(t.id)).length;
  const percent = availableTours.length
    ? Math.round((completed / availableTours.length) * 100)
    : 0;
  const visible = grouped.reduce((sum, g) => sum + g.tours.length, 0);

  const resetProgress = () => {
    try {
      localStorage.removeItem(SEEN_KEY);
      window.dispatchEvent(new Event(TOURS_CHANGED_EVENT));
    } catch {
      /* storage unavailable — nothing to reset */
    }
  };

  return (
    <div className="space-y-6" dir={isRtl ? 'rtl' : 'ltr'}>
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">
            {tr('Interactive Guide', 'الدليل التفاعلي')}
          </h1>
          <p className="max-w-2xl text-muted-foreground">
            {tr(
              'Guided walkthroughs of every part of the system. Each one takes you to the page it explains, opens the panels it describes, and highlights what it is talking about as you go.',
              'جولات إرشادية لكل جزء من النظام. كل جولة تأخذك إلى الصفحة التي تشرحها، وتفتح اللوحات التي تصفها، وتُبرز ما تتحدث عنه أثناء تقدمك.',
            )}
          </p>
        </div>
        <Button
          variant="default"
          size="lg"
          className="gap-2"
          onClick={() => startTour('overview')}
        >
          <Compass className="h-4 w-4" />
          {tr('Start with the overview', 'ابدأ بنظرة عامة')}
        </Button>
      </div>

      {/* Progress + search */}
      <Card>
        <CardContent className="flex flex-col gap-4 p-4 md:flex-row md:items-center">
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="font-medium">
                {tr('Your progress', 'تقدّمك')}
              </span>
              <span className="text-muted-foreground tabular-nums">
                {completed}/{availableTours.length} {tr('tours', 'جولة')} · {percent}%
              </span>
            </div>
            <Progress value={percent} className="h-2" />
            <p className="text-xs text-muted-foreground">
              {tr(
                `${availableTours.length} tours covering ${totalSteps} steps you have access to.`,
                `${availableTours.length} جولة تغطي ${totalSteps} خطوة ضمن صلاحياتك.`,
              )}
            </p>
          </div>
          <div className="flex items-center gap-2 md:w-80">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute start-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={tr('Search guides…', 'ابحث في الأدلة…')}
                className="ps-8"
              />
            </div>
            {completed > 0 && (
              <Button
                variant="ghost"
                size="icon"
                title={tr('Reset progress', 'إعادة تعيين التقدم')}
                onClick={resetProgress}
              >
                <RotateCcw className="h-4 w-4" />
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Categories */}
      {visible === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          {tr('No guide matches that search.', 'لا يوجد دليل يطابق هذا البحث.')}
        </div>
      ) : (
        grouped.map(({ category, tours }) => (
          <section key={category.id} className="space-y-3">
            {/* Stacks on narrow screens — side by side the title wraps awkwardly. */}
            <div className="flex flex-col gap-x-3 gap-y-0.5 border-b pb-2 sm:flex-row sm:items-baseline">
              <h2 className="text-lg font-semibold">
                {locale === 'ar' ? category.ar : category.en}
              </h2>
              <p className="text-sm text-muted-foreground">
                {locale === 'ar' ? category.blurb_ar : category.blurb_en}
              </p>
              <span className="text-xs text-muted-foreground tabular-nums sm:ms-auto">
                {tours.length} {tr('tours', 'جولة')}
              </span>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {tours.map((tour) => {
                const seen = seenTours.includes(tour.id);
                return (
                  <button
                    key={tour.id}
                    type="button"
                    onClick={() => startTour(tour.id)}
                    className="group flex flex-col items-start gap-2 rounded-lg border bg-card p-4 text-start transition-colors hover:border-primary/60 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <div className="flex w-full items-start gap-2">
                      {seen ? (
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                      ) : (
                        <Play className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      )}
                      <span className="font-medium leading-snug">{name(tour)}</span>
                    </div>
                    <p className="line-clamp-2 text-xs text-muted-foreground">
                      {locale === 'ar' ? tour.steps[0]?.ar.desc : tour.steps[0]?.en.desc}
                    </p>
                    <div className="mt-auto flex w-full items-center justify-between pt-1 text-[11px] text-muted-foreground">
                      <span className="tabular-nums">
                        {tour.steps.length} {tr('steps', 'خطوة')}
                      </span>
                      <span className="opacity-0 transition-opacity group-hover:opacity-100">
                        {seen ? tr('Replay', 'إعادة') : tr('Start', 'ابدأ')} →
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
