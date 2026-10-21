'use client';

import { useEffect, useState } from 'react';
import type { CatalogueEntry } from '@/lib/catalogue';
import { t, type Lang } from '@/lib/i18n';
import { InfluencerPhoto } from './influencer-photo';

/**
 * The few seconds "Help me choose" takes to show its groups, drawn as Peak's
 * orbit: the creators circle the mark while a sweep passes over them, the
 * ones that make a group are drawn inward and the rest fade, and three lines
 * count what is being done with the real numbers (creators checked, groups
 * compared). Nothing here is invented; the pause only gives the work a face.
 */

const fill = (text: string, vars: Record<string, string>) => text.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? '');
const RING = 12;

/** Counts up to `to` over `ms` once `start` is true. */
function useCount(to: number, ms: number, start: boolean) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!start) return;
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / ms);
      setN(Math.round(to * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, ms, start]);
  return n;
}

function Step({ on, done, children }: { on: boolean; done: boolean; children: React.ReactNode }) {
  return (
    <li className={`flex items-center gap-2.5 text-[15px] transition-[opacity,transform] duration-300 ${on ? 'translate-y-0 opacity-100' : 'translate-y-1 opacity-0'}`}>
      <span aria-hidden="true" className="flex h-5 w-5 shrink-0 items-center justify-center">
        {done ? (
          <svg viewBox="0 0 16 16" className="h-4 w-4 text-success" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m3.5 8.5 3 3 6-7" /></svg>
        ) : (
          <span className="think-spin h-4 w-4 rounded-full border-2 border-accent/30 border-t-accent" />
        )}
      </span>
      <span className={done ? 'text-ink' : 'text-ink-soft'}>{children}</span>
    </li>
  );
}

export function PlannerThinking({ candidates, chosenIds, groups, duration, hasGoal, markSrc, lang }: {
  candidates: CatalogueEntry[]; chosenIds: string[]; groups: number; duration: number; hasGoal: boolean; markSrc: string | null; lang: Lang;
}) {
  // Three beats: checking, comparing, choosing (pulling the winners inward).
  const [stage, setStage] = useState(0);
  useEffect(() => {
    const a = setTimeout(() => setStage(1), duration * 0.3);
    const b = setTimeout(() => setStage(2), duration * 0.65);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, [duration]);
  const checked = useCount(candidates.length, duration * 0.3, true);
  const compared = useCount(groups, duration * 0.35, stage >= 1);
  const number = (n: number) => new Intl.NumberFormat(lang === 'ar' ? 'ar-OM-u-nu-latn' : 'en-OM').format(n);

  // The ring shows the chosen first, then the biggest of the rest.
  const chosen = new Set(chosenIds);
  const ring = [...candidates.filter((e) => chosen.has(e.id)), ...candidates.filter((e) => !chosen.has(e.id)).sort((a, b) => b.followers - a.followers)].slice(0, RING);

  return (
    <div role="status" aria-live="polite" className="chip-in grid items-center gap-6 py-2 sm:grid-cols-[auto_minmax(0,1fr)]">
      <span className="sr-only">{t(lang, 'plan.thinking.title')}</span>
      <div aria-hidden="true" className="relative mx-auto h-52 w-52 [--size:13rem] sm:h-56 sm:w-56 sm:[--size:14rem]">
        {/* Sweep: a soft orange beam passing round, like a scan. */}
        <div className="think-sweep absolute inset-0 rounded-full" style={{ background: 'conic-gradient(from 0deg, transparent 0deg, rgb(238 113 3 / 0.22) 40deg, transparent 80deg)', mask: 'radial-gradient(circle, transparent 18%, #000 19%, #000 70%, transparent 71%)', WebkitMask: 'radial-gradient(circle, transparent 18%, #000 19%, #000 70%, transparent 71%)' }} />
        <div className="absolute inset-[6%] rounded-full border border-ink/10" />
        <div className="absolute inset-[26%] rounded-full border border-dashed border-ink/10" />
        {/* The creators circle; the chosen are drawn to the inner ring at the last beat. */}
        <div className="think-orbit absolute inset-0">
          {ring.map((e, i) => {
            const angle = (360 / ring.length) * i;
            const isChosen = chosen.has(e.id);
            // Radius as a share of the stage: the outer ring, or the inner one once chosen.
            const r = stage >= 2 && isChosen ? 0.25 : 0.42;
            return (
              <span key={e.id} className="absolute left-1/2 top-1/2 h-12 w-12 transition-[transform,opacity] duration-700 ease-[var(--ease-out)]"
                style={{ translate: '-50% -50%', transform: `rotate(${angle}deg) translateY(calc(var(--size) * -${r})) rotate(${-angle}deg)`, opacity: stage >= 2 && !isChosen ? 0.18 : 1 }}>
                <span className="think-counter block">
                  <span className={`block scale-[0.66] rounded-full ring-2 transition-[box-shadow] duration-500 ${stage >= 2 && isChosen ? 'ring-accent' : 'ring-surface'}`}>
                    <InfluencerPhoto id={e.id} name={e.name} photoAt={e.photoAt} />
                  </span>
                </span>
              </span>
            );
          })}
        </div>
        <div className="absolute inset-[38%] flex items-center justify-center rounded-full border border-ink/10"
          style={{ background: 'radial-gradient(circle at 50% 30%, rgb(255 255 255 / 0.08), #0b0a09 70%)', boxShadow: '0 0 0 6px rgb(238 113 3 / 0.06)' }}>
          {markSrc
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={markSrc} alt="" className="think-pulse h-[58%] w-auto" />
            : <span className="think-pulse h-3 w-3 rounded-full bg-accent" />}
        </div>
      </div>
      <div className="min-w-0 space-y-4">
        <p className="text-[17px] font-extrabold">{t(lang, 'plan.thinking.title')}</p>
        <ul className="space-y-2.5">
          <Step on done={stage >= 1}><bdi>{fill(t(lang, 'plan.thinking.scan'), { n: number(checked) })}</bdi></Step>
          <Step on={stage >= 1} done={stage >= 2}><bdi>{fill(t(lang, 'plan.thinking.combine'), { n: number(compared) })}</bdi></Step>
          <Step on={stage >= 2} done={false}>{t(lang, hasGoal ? 'plan.thinking.rankGoal' : 'plan.thinking.rank')}</Step>
        </ul>
        <div aria-hidden="true" className="h-1 overflow-hidden rounded-full bg-ink/10">
          <div className="think-bar h-full rounded-full bg-accent" style={{ animationDuration: `${duration}ms` }} />
        </div>
      </div>
    </div>
  );
}
