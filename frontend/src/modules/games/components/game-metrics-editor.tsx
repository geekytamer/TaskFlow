'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { setGameMetrics, type Game } from '@/services/gamesService';

type Tr = (en: string, ar: string) => string;
type Param = { name: string; en: string; ar: string; fallback: number | boolean; step?: number };

const quality = (pointsName: string, en: string, ar: string): Param[] => [
  { name: pointsName, en, ar, fallback: 1, step: 0.25 },
  { name: 'maxPerPost', en: 'Most per person per post', ar: 'الحد لكل شخص في المنشور', fallback: 1000 },
  { name: 'minLength', en: 'Shortest text that counts', ar: 'أقصر نص يُحتسب', fallback: 0 },
  { name: 'uniqueText', en: 'Repeated text counts once', ar: 'النص المكرر يُحتسب مرة واحدة', fallback: false },
];
const capped = (pointsName: string, en: string, ar: string): Param[] => [
  { name: pointsName, en, ar, fallback: 1, step: 0.1 },
  { name: 'maxPoints', en: 'Most points (0: no limit)', ar: 'أقصى نقاط (0: بلا حد)', fallback: 0 },
];

/** Mirrors the server's defaults (games/metrics.ts) so an untouched field shows what will apply. */
const PARAMS: Record<string, Param[]> = {
  manual_points: [],
  comments: quality('pointsPerComment', 'Points per comment', 'نقاط لكل تعليق'),
  replies: quality('pointsPerReply', 'Points per reply', 'نقاط لكل رد'),
  mentions: quality('pointsPerMention', 'Points per tag', 'نقاط لكل وسم'),
  likes: [
    { name: 'pointsPerLike', en: 'Points per like', ar: 'نقاط لكل إعجاب', fallback: 1, step: 0.25 },
    { name: 'maxPerPost', en: 'Most per person per post', ar: 'الحد لكل شخص في المنشور', fallback: 1000 },
  ],
  weighted_interactions: [
    { name: 'comment', en: 'Comment', ar: 'تعليق', fallback: 1, step: 0.25 },
    { name: 'reply', en: 'Reply', ar: 'رد', fallback: 0.5, step: 0.25 },
    { name: 'mention', en: 'Tag or mention', ar: 'وسم أو إشارة', fallback: 3, step: 0.25 },
    { name: 'like', en: 'Like', ar: 'إعجاب', fallback: 0.25, step: 0.25 },
    { name: 'diminishing', en: 'Each repeat on a post is worth (×)', ar: 'قيمة كل تكرار على المنشور (×)', fallback: 0.7, step: 0.05 },
    { name: 'maxPerPost', en: 'Most of one kind per post', ar: 'الحد من النوع الواحد لكل منشور', fallback: 10 },
    { name: 'dailyCap', en: 'Most points per person a day (0: none)', ar: 'أقصى نقاط للشخص يوميًا (0: بلا حد)', fallback: 0 },
    { name: 'minLength', en: 'Shortest comment that counts', ar: 'أقصر تعليق يُحتسب', fallback: 3 },
    { name: 'uniqueText', en: 'Repeated text counts once', ar: 'النص المكرر يُحتسب مرة واحدة', fallback: true },
  ],
  first_likers: [
    { name: 'n', en: 'How many first likers score', ar: 'عدد أوائل المعجبين الذين يكسبون', fallback: 100 },
    { name: 'pointsFirst', en: 'Points for the very first', ar: 'نقاط الأول', fallback: 10, step: 0.5 },
    { name: 'pointsLast', en: 'Points for the last of them', ar: 'نقاط الأخير منهم', fallback: 1, step: 0.5 },
  ],
  creator_shares: capped('pointsPerShare', 'Points per share', 'نقاط لكل مشاركة'),
  creator_views: capped('pointsPer1000Views', 'Points per 1,000 views', 'نقاط لكل ١٠٠٠ مشاهدة'),
  creator_engagement: capped('pointsPerEngagement', 'Points per like, comment or save', 'نقاط لكل إعجاب أو تعليق أو حفظ'),
  follower_growth: capped('pointsPerFollower', 'Points per new follower', 'نقاط لكل متابع جديد'),
};

type Row = { on: boolean; weight: string; params: Record<string, string | boolean> };

const fmt = (n: number) => String(Number(n.toFixed(2)));

/** One line a person can check against the board: what each action is worth. */
function weightedSummary(tr: Tr, p: Record<string, string | boolean>) {
  const v = (k: string, d: number) => Number(p[k] ?? d);
  const parts = [
    `${tr('comment', 'تعليق')} ${fmt(v('comment', 1))}`, `${tr('reply', 'رد')} ${fmt(v('reply', 0.5))}`,
    `${tr('tag', 'وسم')} ${fmt(v('mention', 3))}`, `${tr('like', 'إعجاب')} ${fmt(v('like', 0.25))}`,
  ];
  const d = v('diminishing', 0.7);
  const repeat = d < 1 ? tr(`; a second comment on the same post earns ${Math.round(d * 100)}%, a third ${Math.round(d * d * 100)}%`, `؛ التعليق الثاني على المنشور نفسه يكسب ${Math.round(d * 100)}٪ والثالث ${Math.round(d * d * 100)}٪`) : '';
  return `${tr('Points: ', 'النقاط: ')}${parts.join(' · ')}${repeat}.`;
}

/** Choose how points are earned: the metrics this game's sources can supply, each with a weight. */
export function GameMetricsEditor({ companyId, game, tr, language, locked, onChange, onError }: {
  companyId: string; game: Game; tr: Tr; language: string; locked: boolean; onChange: (g: Game) => void; onError: (e: unknown) => void;
}) {
  const id = React.useId();
  const initial = React.useCallback(() => Object.fromEntries(game.availableMetrics.map((m) => {
    const current = game.metrics.find((x) => x.metricKey === m.key);
    const params = Object.fromEntries((PARAMS[m.key] ?? []).map((p) => {
      const value = current?.params[p.name] ?? p.fallback;
      return [p.name, typeof p.fallback === 'boolean' ? Boolean(value) : String(value)];
    }));
    return [m.key, { on: Boolean(current), weight: String(current?.weight ?? 1), params }];
  })) as Record<string, Row>, [game.availableMetrics, game.metrics]);
  const [rows, setRows] = React.useState<Record<string, Row>>(initial);
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => setRows(initial()), [initial]);

  const patch = (key: string, fn: (r: Row) => Row) => setRows((all) => ({ ...all, [key]: fn(all[key]) }));
  const chosen = Object.entries(rows).filter(([, r]) => r.on);
  const dirty = JSON.stringify(rows) !== JSON.stringify(initial());

  const save = async () => {
    setBusy(true);
    try {
      onChange(await setGameMetrics(companyId, game.id, chosen.map(([key, r]) => ({
        metricKey: key,
        weight: Number(r.weight),
        params: Object.fromEntries(Object.entries(r.params).map(([k, v]) => [k, typeof v === 'boolean' ? v : Number(v)])),
      }))));
    } catch (error) { onError(error); } finally { setBusy(false); }
  };

  return (
    <section className="space-y-3 rounded-md border p-3" aria-labelledby={`${id}-h`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id={`${id}-h`} className="text-sm font-semibold">{tr('How points are earned', 'كيف تُكتسب النقاط')}</h3>
        <p className="text-xs text-muted-foreground">{tr('Total = each metric’s points × its weight.', 'المجموع = نقاط كل مقياس × وزنه.')}</p>
      </div>
      {game.availableMetrics.length <= 1 && (
        <p className="text-xs text-muted-foreground">
          {game.audience === 'creators'
            ? tr('Add participants to unlock shares, views, engagement and follower growth.', 'أضف مشاركين لتفعيل المشاركات والمشاهدات والتفاعل ونمو المتابعين.')
            : tr('Add a post, tags or a likers list under Live data to score comments, replies, tags and likes automatically.', 'أضف منشورًا أو وسومًا أو قائمة معجبين في البيانات المباشرة لاحتساب التعليقات والردود والوسوم والإعجابات تلقائيًا.')}
        </p>
      )}
      <ul className="space-y-2">
        {game.availableMetrics.map((m) => {
          const r = rows[m.key];
          if (!r) return null;
          const params = PARAMS[m.key] ?? [];
          return (
            <li key={m.key} className={`rounded-md border p-3 ${r.on ? 'border-primary/50 bg-primary/5' : ''}`}>
              <div className="flex flex-wrap items-center gap-3">
                <Checkbox id={`${id}-${m.key}`} checked={r.on} disabled={locked} onCheckedChange={(v) => patch(m.key, (x) => ({ ...x, on: v === true }))} />
                <Label htmlFor={`${id}-${m.key}`} className="min-w-0 flex-1 font-medium">{language === 'ar' ? m.label.ar : m.label.en}</Label>
                {r.on && (
                  <span className="flex items-center gap-2">
                    <Label htmlFor={`${id}-${m.key}-w`} className="text-xs text-muted-foreground">{tr('Weight', 'الوزن')}</Label>
                    <Input id={`${id}-${m.key}-w`} className="h-9 w-20" type="number" min={0.1} max={100} step={0.1} dir="ltr" disabled={locked}
                      value={r.weight} onChange={(e) => patch(m.key, (x) => ({ ...x, weight: e.target.value }))} />
                  </span>
                )}
              </div>
              {r.on && params.length > 0 && (
                <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {params.map((p) => (typeof p.fallback === 'boolean' ? (
                    <label key={p.name} className="flex min-h-11 items-center gap-2 text-sm">
                      <Switch checked={Boolean(r.params[p.name])} disabled={locked} onCheckedChange={(v) => patch(m.key, (x) => ({ ...x, params: { ...x.params, [p.name]: v } }))} />
                      {tr(p.en, p.ar)}
                    </label>
                  ) : (
                    <div key={p.name} className="space-y-1">
                      <Label htmlFor={`${id}-${m.key}-${p.name}`} className="text-xs">{tr(p.en, p.ar)}</Label>
                      <Input id={`${id}-${m.key}-${p.name}`} type="number" min={0} step={p.step ?? 1} dir="ltr" disabled={locked}
                        value={String(r.params[p.name])} onChange={(e) => patch(m.key, (x) => ({ ...x, params: { ...x.params, [p.name]: e.target.value } }))} />
                    </div>
                  )))}
                </div>
              )}
              {r.on && m.key === 'weighted_interactions' && <p className="mt-2 text-xs text-muted-foreground">{weightedSummary(tr, r.params)}</p>}
            </li>
          );
        })}
      </ul>
      {!locked && (
        <div className="flex items-center justify-end gap-3">
          {chosen.length === 0 && <span className="text-xs text-destructive">{tr('Choose at least one.', 'اختر واحدًا على الأقل.')}</span>}
          <Button size="sm" disabled={busy || !dirty || chosen.length === 0 || chosen.length > 5} onClick={save}>{tr('Save scoring', 'حفظ طريقة الاحتساب')}</Button>
        </div>
      )}
    </section>
  );
}
