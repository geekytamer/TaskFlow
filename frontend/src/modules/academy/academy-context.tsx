'use client';

import * as React from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useCompany } from '@/context/company-context';
import { useI18n } from '@/context/i18n-context';
import {
  getAcademy, getImpact, reportObjective, resetAcademy, startAcademy,
  type AcademyImpact, type AcademyMission, type AcademyProgress,
} from '@/services/academyService';

/** Fired by the notification bell when it opens (first-day objective). */
export const NOTIFICATIONS_OPENED_EVENT = 'taskflow:notifications-opened';

interface AcademyContextValue {
  progress: AcademyProgress | null;
  /** The selected company is the user's practice company. */
  inPractice: boolean;
  /** The mission the dock is working on: the first open one on the path. */
  currentMission: AcademyMission | null;
  locked: Set<string>;
  refresh: () => Promise<AcademyProgress | null>;
  /** Creates (or reopens) the practice company and switches to it. */
  enterPractice: () => Promise<void>;
  leavePractice: () => void;
  reset: () => Promise<void>;
  /** The latest impact numbers and the ones from before the current objective. */
  impact: AcademyImpact | null;
  impactBefore: AcademyImpact | null;
  /** The objective that just completed, for the impact panel. */
  justCompleted: { missionId: string; objectiveId: string; title: { en: string; ar: string } } | null;
  dismissCompleted: () => void;
}

const AcademyContext = React.createContext<AcademyContextValue | null>(null);

const POLL_MS = 3000;
const REDIRECTED_KEY = 'taskflow_academy_redirected';

export function AcademyProvider({ children }: { children: React.ReactNode }) {
  const { selectedCompany, companies, setSelectedCompany, currentUser } = useCompany();
  const { language } = useI18n();
  const pathname = usePathname();
  const router = useRouter();
  const [progress, setProgress] = React.useState<AcademyProgress | null>(null);
  const [impact, setImpact] = React.useState<AcademyImpact | null>(null);
  const [impactBefore, setImpactBefore] = React.useState<AcademyImpact | null>(null);
  const [justCompleted, setJustCompleted] = React.useState<AcademyContextValue['justCompleted']>(null);
  const previous = React.useRef<AcademyProgress | null>(null);
  const impactRef = React.useRef<AcademyImpact | null>(null);

  const inPractice = Boolean(progress?.practiceCompanyId && selectedCompany?.id === progress.practiceCompanyId);
  const currentMission = React.useMemo(
    () => progress?.missions.find((m) => m.status === 'open') ?? null,
    [progress],
  );

  /** Compares two progress readings: the first objective that flipped to done. */
  const firstNewlyDone = (before: AcademyProgress | null, after: AcademyProgress) => {
    if (!before) return null;
    for (const m of after.missions) {
      const old = before.missions.find((x) => x.id === m.id);
      for (const o of m.objectives) {
        if (o.done && old && !old.objectives.find((x) => x.id === o.id)?.done) {
          return { missionId: m.id, objectiveId: o.id, title: o.title };
        }
      }
    }
    return null;
  };

  const refresh = React.useCallback(async () => {
    if (!currentUser || currentUser.isSuperAdmin) return null;
    try {
      const next = await getAcademy();
      const done = firstNewlyDone(previous.current, next);
      previous.current = next;
      setProgress(next);
      if (next.practiceCompanyId && selectedCompany?.id === next.practiceCompanyId) {
        const now = await getImpact().catch(() => null);
        // The panel compares the numbers from before this objective with now.
        if (done) {
          setImpactBefore(impactRef.current);
          setJustCompleted(done);
        }
        impactRef.current = now;
        setImpact(now);
      }
      return next;
    } catch {
      return null;
    }
  }, [currentUser, selectedCompany?.id]);

  React.useEffect(() => { void refresh(); }, [refresh]);

  // In practice, objectives are checked as the trainee works.
  React.useEffect(() => {
    if (!inPractice) return;
    const timer = window.setInterval(() => { void refresh(); }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [inPractice, refresh]);

  // Steps the server cannot see (first-day actions, page visits): report them once each.
  const report = React.useCallback(async (objectiveId: string, missionId = 'first-day') => {
    const mission = progress?.missions.find((m) => m.id === missionId);
    const objective = mission?.objectives.find((o) => o.id === objectiveId);
    if (!mission || mission.status !== 'open' || !objective || objective.done) return;
    try {
      const next = await reportObjective(missionId, objectiveId);
      const done = firstNewlyDone(previous.current, next);
      previous.current = next;
      setProgress(next);
      if (done) setJustCompleted(done);
    } catch { /* the next refresh will show the real state */ }
  }, [progress]);

  // Only a deliberate visit counts: landing on '/' after sign-in (before the redirect) does not.
  const lastPath = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (pathname === '/' && lastPath.current !== null && lastPath.current !== '/') void report('open-dashboard');
    lastPath.current = pathname;
  }, [pathname, report]);
  // "Open this screen" objectives count in the practice company, where the screen shows the trainee's own work.
  React.useEffect(() => {
    if (!inPractice || !pathname) return;
    for (const m of progress?.missions ?? []) {
      for (const o of m.objectives) if (o.visit === pathname && !o.done) void report(o.id, m.id);
    }
  }, [pathname, inPractice, progress, report]);
  React.useEffect(() => {
    const onOpen = () => { void report('open-notifications'); };
    window.addEventListener(NOTIFICATIONS_OPENED_EVENT, onOpen);
    return () => window.removeEventListener(NOTIFICATIONS_OPENED_EVENT, onOpen);
  }, [report]);
  const firstLanguage = React.useRef(language);
  React.useEffect(() => {
    if (language !== firstLanguage.current) void report('switch-language');
  }, [language, report]);

  // Mandatory: someone with locked modules and an unfinished path starts in the Academy (once a session).
  React.useEffect(() => {
    if (!progress || progress.lockedModules.length === 0 || pathname?.startsWith('/academy')) return;
    if (progress.missions.every((m) => m.status === 'done')) return;
    try {
      if (sessionStorage.getItem(REDIRECTED_KEY)) return;
      sessionStorage.setItem(REDIRECTED_KEY, '1');
    } catch { /* storage blocked: redirect anyway */ }
    router.replace('/academy');
  }, [progress, pathname, router]);

  const switchTo = React.useCallback((companyId: string) => {
    try { localStorage.setItem('selectedCompanyId', companyId); } catch { /* falls back to the first company */ }
    const known = companies.find((c) => c.id === companyId);
    if (known) setSelectedCompany(known);
    else window.dispatchEvent(new Event('taskflow-token-changed')); // reload the user and their companies
  }, [companies, setSelectedCompany]);

  const enterPractice = React.useCallback(async () => {
    const next = await startAcademy();
    previous.current = next;
    setProgress(next);
    if (next.practiceCompanyId) switchTo(next.practiceCompanyId);
  }, [switchTo]);

  const leavePractice = React.useCallback(() => {
    const real = companies.find((c) => !c.isTraining);
    if (real) setSelectedCompany(real);
  }, [companies, setSelectedCompany]);

  const reset = React.useCallback(async () => {
    const next = await resetAcademy();
    previous.current = next;
    setProgress(next);
    impactRef.current = null;
    setImpact(null);
    setImpactBefore(null);
    if (next.practiceCompanyId) {
      try { localStorage.setItem('selectedCompanyId', next.practiceCompanyId); } catch { /* ignore */ }
      window.dispatchEvent(new Event('taskflow-token-changed'));
    }
  }, []);

  const value = React.useMemo<AcademyContextValue>(() => ({
    progress, inPractice, currentMission,
    locked: new Set(progress?.lockedModules ?? []),
    refresh, enterPractice, leavePractice, reset,
    impact, impactBefore, justCompleted,
    dismissCompleted: () => setJustCompleted(null),
  }), [progress, inPractice, currentMission, refresh, enterPractice, leavePractice, reset, impact, impactBefore, justCompleted]);

  return <AcademyContext.Provider value={value}>{children}</AcademyContext.Provider>;
}

export function useAcademy() {
  const value = React.useContext(AcademyContext);
  if (!value) throw new Error('useAcademy must be used inside AcademyProvider');
  return value;
}
