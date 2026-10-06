'use client';

import * as React from 'react';
import { Check, Clock, GraduationCap, Lightbulb, Lock, Play, RotateCcw, Sparkles, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useCompany } from '@/context/company-context';
import { useI18n } from '@/context/i18n-context';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { getTeam, type AcademyMission, type TeamMember } from '@/services/academyService';
import { moduleLabel } from '@/modules/permissions/lib/labels';
import { useAcademy } from '../academy-context';
import { EXPLAINERS } from '../lib/explainers';

const LEVEL_XP = 200;

/**
 * The Academy: the trainee's mission path, level and badges, and the way into
 * their practice company. Mandatory: unfinished missions keep their modules
 * locked in real companies.
 */
export function AcademyPage() {
  const { progress, enterPractice, reset, inPractice, currentMission } = useAcademy();
  const { companies, selectedCompany } = useCompany();
  const { language, t } = useI18n();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);
  const labels = (modules: string[]) => modules.map((m) => moduleLabel(m, t)).join(language === 'ar' ? '، ' : ', ');
  const { toast } = useToast();
  const confirm = useConfirm();
  const [busy, setBusy] = React.useState(false);
  const [team, setTeam] = React.useState<TeamMember[] | null>(null);
  const realCompany = selectedCompany && !selectedCompany.isTraining ? selectedCompany : companies.find((c) => !c.isTraining) ?? null;

  React.useEffect(() => {
    if (!realCompany) return;
    getTeam(realCompany.id).then(setTeam).catch(() => setTeam(null));
  }, [realCompany?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!progress) {
    return <p className="py-24 text-center text-muted-foreground">{tr('Loading your missions…', 'جارٍ تحميل مهامك…')}</p>;
  }

  const done = progress.missions.filter((m) => m.status === 'done').length;
  const total = progress.missions.length;
  const graceDays = progress.graceUntil ? Math.ceil((Date.parse(progress.graceUntil) - Date.now()) / 86400000) : 0;
  const go = async () => {
    setBusy(true);
    try { await enterPractice(); } catch (error: any) {
      toast({ variant: 'destructive', title: tr('Could not open your practice company', 'تعذّر فتح شركتك التدريبية'), description: error?.message });
    } finally { setBusy(false); }
  };

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8">
      <header className="flex flex-col gap-4 rounded-xl border bg-gradient-to-br from-primary/10 via-background to-background p-6 sm:flex-row sm:items-center">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <GraduationCap className="h-7 w-7" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold font-headline">{tr('TaskFlow Academy', 'أكاديمية TaskFlow')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {tr('Learn by running Al Waha Trading, your own practice company. Every mission unlocks part of the real system and shows what your actions do to the books.',
                'تعلّم بإدارة شركة الواحة للتجارة، شركتك التدريبية. كل مهمة تفتح جزءاً من النظام الحقيقي وتريك أثر أفعالك على الدفاتر.')}
          </p>
          <div className="mt-3 flex items-center gap-3 text-sm">
            <span className="font-semibold">{tr(`Level ${progress.level}`, `المستوى ${progress.level}`)}</span>
            <Progress value={((progress.xp % LEVEL_XP) / LEVEL_XP) * 100} className="h-2 max-w-48 flex-1" aria-label={tr('Progress to next level', 'التقدم نحو المستوى التالي')} />
            <span className="tabular-nums text-muted-foreground">{progress.xp} XP · {done}/{total} {tr('missions', 'مهام')}</span>
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:items-end">
          <Button size="lg" onClick={go} disabled={busy || inPractice}>
            <Play className="me-2 h-4 w-4" />
            {inPractice ? tr('You are in practice', 'أنت في التدريب') : progress.practiceCompanyId ? tr('Continue training', 'تابع التدريب') : tr('Start training', 'ابدأ التدريب')}
          </Button>
          {progress.practiceCompanyId && (
            <Button variant="ghost" size="sm" disabled={busy} onClick={async () => {
              if (!(await confirm({
                title: tr('Start the practice company over?', 'إعادة الشركة التدريبية من البداية؟'),
                description: tr('Everything in it is wiped and you get a fresh one. Missions you finished stay finished.', 'يُمسح كل ما فيها وتحصل على واحدة جديدة. تبقى المهام المنجزة منجزة.'),
                confirmText: tr('Start over', 'ابدأ من جديد'), cancelText: tr('Cancel', 'إلغاء'), destructive: true,
              }))) return;
              setBusy(true);
              try { await reset(); toast({ title: tr('Fresh practice company ready', 'الشركة التدريبية الجديدة جاهزة') }); }
              catch (error: any) { toast({ variant: 'destructive', title: tr('Could not reset', 'تعذّرت الإعادة'), description: error?.message }); }
              finally { setBusy(false); }
            }}>
              <RotateCcw className="me-1.5 h-3.5 w-3.5" />{tr('Start over', 'ابدأ من جديد')}
            </Button>
          )}
        </div>
      </header>

      {graceDays > 0 && done < total && (
        <p className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">
          <Clock className="h-4 w-4 shrink-0" />
          {tr(`You have ${graceDays} day${graceDays === 1 ? '' : 's'} before unfinished missions lock their modules.`, `أمامك ${graceDays} يوم قبل أن تُقفل المهام غير المنجزة وحداتها.`)}
        </p>
      )}
      {progress.lockedModules.length > 0 && graceDays <= 0 && (
        <p className="flex items-center gap-2 rounded-lg border bg-muted/40 px-4 py-2 text-sm">
          <Lock className="h-4 w-4 shrink-0 text-muted-foreground" />
          {tr('Locked until you finish their missions: ', 'مقفلة حتى تكمل مهامها: ')}
          <span className="font-medium">{labels(progress.lockedModules)}</span>
        </p>
      )}

      <section aria-labelledby="path-title">
        <h2 id="path-title" className="mb-3 text-lg font-semibold">{tr('Your missions', 'مهامك')}</h2>
        <ol className="relative space-y-3 border-s-2 border-dashed border-muted ps-6">
          {progress.missions.map((m, i) => (
            <MissionCard key={m.id} mission={m} index={i} current={m.id === currentMission?.id} tr={tr} labels={labels} />
          ))}
        </ol>
      </section>

      {progress.badges.length > 0 && (
        <section aria-labelledby="badges-title">
          <h2 id="badges-title" className="mb-3 text-lg font-semibold">{tr('Badges', 'الأوسمة')}</h2>
          <ul className="flex flex-wrap gap-2">
            {progress.missions.filter((m) => m.status === 'done').map((m) => (
              <li key={m.id}><Badge variant="secondary" className="gap-1 py-1"><Sparkles className="h-3 w-3" />{tr(m.title.en, m.title.ar)}</Badge></li>
            ))}
          </ul>
        </section>
      )}

      {(() => {
        const learned = progress.missions.flatMap((m) => m.objectives.filter((o) => o.done).map((o) => EXPLAINERS[`${m.id}/${o.id}`]).filter(Boolean));
        if (learned.length === 0) return null;
        return (
          <section aria-labelledby="learned-title">
            <h2 id="learned-title" className="mb-1 flex items-center gap-2 text-lg font-semibold"><Lightbulb className="h-5 w-5 text-amber-500" />{tr('What you have learned', 'ما تعلّمته')}</h2>
            <p className="mb-3 text-sm text-muted-foreground">{tr('The rules behind the steps you took, to look back on.', 'القواعد وراء الخطوات التي قمت بها، للرجوع إليها.')}</p>
            <dl className="grid gap-3 sm:grid-cols-2">
              {learned.map((e) => (
                <div key={e.title.en} className="rounded-lg border p-3">
                  <dt className="font-medium" dir="auto">{tr(e.title.en, e.title.ar)}</dt>
                  <dd className="mt-1 text-sm text-muted-foreground" dir="auto">{tr(e.en, e.ar)}</dd>
                </div>
              ))}
            </dl>
          </section>
        );
      })()}

      {team && team.length > 0 && realCompany && (
        <section aria-labelledby="team-title">
          <h2 id="team-title" className="mb-1 flex items-center gap-2 text-lg font-semibold"><Users className="h-5 w-5" />{tr(`Team at ${realCompany.name}`, `الفريق في ${realCompany.name}`)}</h2>
          <p className="mb-3 text-sm text-muted-foreground">{tr('Missions finished. Everyone goes at their own pace.', 'المهام المنجزة. كلٌ بحسب وتيرته.')}</p>
          <ul className="divide-y rounded-lg border">
            {team.map((p) => (
              <li key={p.userId} className="flex items-center gap-3 px-4 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate" dir="auto">{p.name}</span>
                <Progress value={p.required ? (Math.min(p.done, p.required) / p.required) * 100 : 0} className="h-1.5 w-32" aria-label={tr(`${p.name}'s progress`, `تقدم ${p.name}`)} />
                <span className="w-14 text-end tabular-nums text-muted-foreground">{Math.min(p.done, p.required)}/{p.required}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function MissionCard({ mission, index, current, tr, labels }: { mission: AcademyMission; index: number; current: boolean; tr: (en: string, ar: string) => string; labels: (modules: string[]) => string }) {
  const doneCount = mission.objectives.filter((o) => o.done).length;
  const isDone = mission.status === 'done';
  return (
    <li className="relative">
      <span
        aria-hidden="true"
        className={cn(
          'absolute -start-[2.15rem] top-4 flex h-6 w-6 items-center justify-center rounded-full border-2 bg-background text-[11px] font-semibold',
          isDone ? 'border-emerald-600 bg-emerald-600 text-white' : current ? 'border-primary text-primary' : 'border-muted text-muted-foreground',
        )}
      >
        {isDone ? <Check className="h-3.5 w-3.5" /> : index + 1}
      </span>
      <div className={cn('rounded-lg border p-4', current && 'border-primary shadow-sm', isDone && 'bg-muted/30')}>
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-semibold" dir="auto">{tr(mission.title.en, mission.title.ar)}</h3>
          <Badge variant="outline" className="tabular-nums">{mission.xp} XP</Badge>
          {mission.status === 'waiting' && <Badge variant="secondary">{tr('Opens after the buying, selling and books missions', 'تُفتح بعد مهام الشراء والبيع والدفاتر')}</Badge>}
          <span className="ms-auto text-xs tabular-nums text-muted-foreground">{doneCount}/{mission.objectives.length}</span>
        </div>
        <p className="mt-1 text-sm text-muted-foreground" dir="auto">{tr(mission.story.en, mission.story.ar)}</p>
        {mission.modules.length > 0 && (
          <p className="mt-2 text-xs text-muted-foreground">
            {isDone ? tr('Unlocked: ', 'تم فتح: ') : tr('Unlocks: ', 'يفتح: ')}<span className="font-medium text-foreground">{labels(mission.modules)}</span>
          </p>
        )}
      </div>
    </li>
  );
}
