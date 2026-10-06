'use client';

import * as React from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { getViewerCandidates, setGameViewers, type Game, type ViewerCandidate } from '@/services/gamesService';

type Tr = (en: string, ar: string) => string;
type Viewer = { subjectType: 'user' | 'portal_user'; subjectId: string };
const keyOf = (v: Viewer) => `${v.subjectType}:${v.subjectId}`;

/** Who may see a restricted game: picked from the company's staff and portal users. Saves as you tick. */
export function GameViewersPicker({ companyId, game, tr, onError }: {
  companyId: string; game: Game & { viewers?: Viewer[] }; tr: Tr; onError: (e: unknown) => void;
}) {
  const [candidates, setCandidates] = React.useState<{ staff: ViewerCandidate[]; portal: ViewerCandidate[] } | null>(null);
  const [chosen, setChosen] = React.useState<Set<string>>(new Set((game.viewers ?? []).map(keyOf)));
  const [filter, setFilter] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    let live = true;
    getViewerCandidates(companyId, game.id).then((c) => { if (live) setCandidates(c); }).catch((e) => { if (live) { setCandidates({ staff: [], portal: [] }); onError(e); } });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, game.id]);

  const toggle = async (c: ViewerCandidate, on: boolean) => {
    const next = new Set(chosen);
    if (on) next.add(keyOf(c)); else next.delete(keyOf(c));
    setChosen(next);
    setBusy(true);
    try {
      await setGameViewers(companyId, game.id, [...next].map((k) => { const [subjectType, subjectId] = k.split(':'); return { subjectType: subjectType as Viewer['subjectType'], subjectId }; }));
    } catch (error) { setChosen(chosen); onError(error); } finally { setBusy(false); }
  };

  const match = (c: ViewerCandidate) => !filter.trim() || `${c.name} ${c.detail}`.toLowerCase().includes(filter.trim().toLowerCase());
  const group = (title: string, list: ViewerCandidate[]) => list.filter(match).length > 0 && (
    <div>
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      <ul className="space-y-1">
        {list.filter(match).map((c) => (
          <li key={keyOf(c)}>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={chosen.has(keyOf(c))} disabled={busy} onCheckedChange={(v) => toggle(c, v === true)} />
              <span dir="auto">{c.name}</span>
              <span className="truncate text-xs text-muted-foreground" dir="auto">{c.detail}</span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );

  return (
    <section className="space-y-3 rounded-md border p-4">
      <div>
        <p className="text-sm font-medium">{tr('Who can see this game', 'من يمكنه رؤية هذه المسابقة')}</p>
        <p className="text-xs text-muted-foreground">{tr(`It is restricted: only the people ticked here see it. ${chosen.size} chosen.`, `المسابقة مقيّدة: لا يراها إلا من تختارهم هنا. المختارون: ${chosen.size}.`)}</p>
      </div>
      {candidates === null ? <p className="text-sm text-muted-foreground">{tr('Loading…', 'جارٍ التحميل…')}</p> : (
        <>
          <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={tr('Search people', 'ابحث عن أشخاص')} aria-label={tr('Search people', 'ابحث عن أشخاص')} className="sm:max-w-xs" />
          <div className="grid max-h-64 gap-4 overflow-y-auto sm:grid-cols-2">
            {group(tr('Portal users', 'مستخدمو البوابة'), candidates.portal)}
            {group(tr('Staff', 'الموظفون'), candidates.staff)}
          </div>
        </>
      )}
    </section>
  );
}
