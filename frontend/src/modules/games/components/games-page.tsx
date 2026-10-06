'use client';

import * as React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useCompany } from '@/context/company-context';
import { useI18n } from '@/context/i18n-context';
import { useToast } from '@/hooks/use-toast';
import { SectionEmptyState } from '@/modules/operations/components/section-empty-state';
import { SectionPageShell } from '@/modules/operations/components/section-page-shell';
import {
  archiveGame,
  awardPoints,
  createGame,
  getScoreboard,
  listAwards,
  listGamesOrNull,
  publishGame,
  removeActorRule,
  reopenGame,
  setActorRule,
  setGameMetrics,
  updateGame,
  type AwardRow,
  type BoardRow,
  type Game,
  type GameInput,
  type GameStatus,
} from '@/services/gamesService';
import { Download, ExternalLink, Plus } from 'lucide-react';
import { GameClientPicker } from './game-client-picker';
import { GameViewersPicker } from './game-viewers-picker';
import { GameLivePanel } from './game-live-panel';
import { GameMetricsEditor } from './game-metrics-editor';

type Tr = (en: string, ar: string) => string;
const PLATFORMS = ['instagram', 'tiktok', 'youtube', 'snapchat', 'x', 'facebook', 'other'] as const;
const LOBBY_URL = (process.env.NEXT_PUBLIC_LOBBY_URL || 'http://localhost:9005').replace(/\/$/, '');

/** `<input type="datetime-local">` wants local time without a zone. */
const toLocalInput = (iso: string) => {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const statusLabel = (tr: Tr, s: GameStatus) => ({
  draft: tr('Draft', 'مسودة'), scheduled: tr('Scheduled', 'مجدولة'), live: tr('Live', 'مباشرة'), ended: tr('Ended', 'منتهية'), archived: tr('Archived', 'مؤرشفة'),
})[s];

/**
 * Engagement games for the portal company: build, publish, award points and
 * moderate. Only admins reach this page; the API answers 403 or 404 otherwise.
 */
export function GamesPage() {
  const { language } = useI18n();
  const tr: Tr = (en, ar) => (language === 'ar' ? ar : en);
  const { toast } = useToast();
  const { selectedCompany } = useCompany();
  const companyId = selectedCompany?.id;
  const [games, setGames] = React.useState<Game[] | null | undefined>(undefined);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);

  const load = React.useCallback(async () => {
    if (!companyId) return;
    try {
      setGames(await listGamesOrNull(companyId));
    } catch (error) {
      setGames([]);
      toast({ title: error instanceof Error ? error.message : tr('Could not load games', 'تعذّر تحميل الألعاب'), variant: 'destructive' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  React.useEffect(() => { void load(); }, [load]);

  const fail = (error: unknown) => toast({ title: error instanceof Error ? error.message : tr('Something went wrong', 'حدث خطأ'), variant: 'destructive' });
  const replace = (game: Game) => setGames((list) => (list ?? []).some((g) => g.id === game.id) ? list!.map((g) => (g.id === game.id ? game : g)) : [game, ...(list ?? [])]);
  const selected = games?.find((g) => g.id === selectedId) ?? null;

  if (games === null) {
    return (
      <SectionPageShell title={tr('Games', 'الألعاب')} description="">
        <SectionEmptyState
          title={tr('Games are not available', 'الألعاب غير متاحة')}
          description={tr('Games run for the portal company, and only administrators can manage them.', 'تعمل الألعاب لشركة البوابة فقط، ويديرها المسؤولون فقط.')}
        />
      </SectionPageShell>
    );
  }

  return (
    <SectionPageShell
      title={tr('Games', 'الألعاب')}
      description={tr('Leaderboards scored from Instagram: followers play on your posts, or influencers compete on their own. Publish to the public lobby.', 'لوحات صدارة تُحتسب من إنستغرام: يلعب المتابعون على منشوراتك، أو يتنافس المؤثرون بمنشوراتهم. انشرها في الردهة العامة.')}
      actions={
        <>
          <Button variant="outline" asChild>
            <a href={`${LOBBY_URL}/games`} target="_blank" rel="noopener noreferrer"><ExternalLink className="me-1.5 h-4 w-4" />{tr('Open the public lobby', 'فتح الردهة العامة')}</a>
          </Button>
          <Button onClick={() => { setCreating(true); setSelectedId(null); }}><Plus className="me-1.5 h-4 w-4" />{tr('New game', 'لعبة جديدة')}</Button>
        </>
      }
    >
      <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <ul className="space-y-2" aria-label={tr('Games', 'الألعاب')}>
          {games === undefined && <li className="text-sm text-muted-foreground">{tr('Loading…', 'جارٍ التحميل…')}</li>}
          {games?.length === 0 && <li className="text-sm text-muted-foreground">{tr('No games yet.', 'لا توجد ألعاب بعد.')}</li>}
          {games?.map((g) => (
            <li key={g.id}>
              <button
                type="button"
                onClick={() => { setSelectedId(g.id); setCreating(false); }}
                aria-current={selectedId === g.id ? 'true' : undefined}
                className={`w-full rounded-md border p-3 text-start transition-colors ${selectedId === g.id ? 'border-primary bg-primary/5' : 'hover:bg-muted'}`}
              >
                <span className="flex items-center justify-between gap-2">
                  <span dir="auto" className="truncate font-medium">{(language === 'ar' && g.nameAr) || g.name}</span>
                  <Badge variant={g.status === 'live' ? 'default' : 'secondary'}>{statusLabel(tr, g.status)}</Badge>
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  <span dir="ltr">/{g.slug}</span>
                  {` · ${g.audience === 'creators' ? tr('influencers compete', 'منافسة مؤثرين') : tr('followers play', 'يلعب المتابعون')}`}
                  {g.visibility === 'restricted' ? ` · ${tr('restricted', 'مقيّدة')}` : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>

        <div className="min-w-0">
          {creating && companyId && (
            <GameForm tr={tr} onCancel={() => setCreating(false)} onSave={async (input) => {
              try {
                const game = await createGame(companyId, input);
                const withMetric = await setGameMetrics(companyId, game.id, [{ metricKey: 'manual_points', weight: 1, params: {} }]);
                replace(withMetric);
                setCreating(false);
                setSelectedId(game.id);
              } catch (error) { fail(error); }
            }} />
          )}
          {!creating && selected && companyId && (
            <GameDetail key={selected.id} companyId={companyId} game={selected} tr={tr} language={language} onChange={replace} onError={fail} />
          )}
          {!creating && !selected && games && games.length > 0 && (
            <p className="text-sm text-muted-foreground">{tr('Choose a game to manage it.', 'اختر لعبة لإدارتها.')}</p>
          )}
        </div>
      </div>
    </SectionPageShell>
  );
}

function GameForm({ tr, game, onSave, onCancel }: { tr: Tr; game?: Game; onSave: (input: GameInput) => Promise<void>; onCancel?: () => void }) {
  const id = React.useId();
  const [form, setForm] = React.useState({
    slug: game?.slug ?? '', name: game?.name ?? '', nameAr: game?.nameAr ?? '',
    rules: game?.rules ?? '', rulesAr: game?.rulesAr ?? '', prize: game?.prize ?? '', prizeAr: game?.prizeAr ?? '',
    visibility: game?.visibility ?? 'public' as 'public' | 'restricted',
    audience: game?.audience ?? 'followers' as 'followers' | 'creators',
    tag: game?.tag ?? '',
    startsAt: game ? toLocalInput(game.startsAt) : '', endsAt: game ? toLocalInput(game.endsAt) : '',
  });
  const [busy, setBusy] = React.useState(false);
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const field = (k: keyof typeof form, label: string, opts: { area?: boolean; dir?: 'ltr' | 'auto'; type?: string } = {}) => (
    <div className="space-y-1.5">
      <Label htmlFor={`${id}-${k}`}>{label}</Label>
      {opts.area
        ? <Textarea id={`${id}-${k}`} dir={opts.dir ?? 'auto'} rows={3} value={form[k]} onChange={(e) => set(k, e.target.value)} />
        : <Input id={`${id}-${k}`} dir={opts.dir ?? 'auto'} type={opts.type ?? 'text'} value={form[k]} onChange={(e) => set(k, e.target.value)} disabled={k === 'slug' && Boolean(game)} />}
    </div>
  );
  const tagOk = !form.tag.trim() || /^[@#][\p{L}\p{N}._]{2,60}$/u.test(form.tag.trim());
  const valid = form.name.trim() && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(form.slug) && form.startsAt && form.endsAt && form.endsAt > form.startsAt && tagOk;
  const audienceLocked = Boolean(game?.publishedAt);

  return (
    <form
      className="space-y-4 rounded-md border p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!valid) return;
        setBusy(true);
        await onSave({
          ...(game ? {} : { slug: form.slug }), name: form.name, nameAr: form.nameAr, rules: form.rules, rulesAr: form.rulesAr,
          prize: form.prize, prizeAr: form.prizeAr, visibility: form.visibility,
          ...(audienceLocked ? {} : { audience: form.audience }), tag: form.tag.trim(),
          startsAt: new Date(form.startsAt).toISOString(), endsAt: new Date(form.endsAt).toISOString(),
        });
        setBusy(false);
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {field('name', tr('Name (English)', 'الاسم (بالإنجليزية)'))}
        {field('nameAr', tr('Name (Arabic)', 'الاسم (بالعربية)'))}
        {field('slug', tr('Lobby address (lowercase, dashes)', 'عنوان الردهة (أحرف صغيرة وشرطات)'), { dir: 'ltr' })}
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-visibility`}>{tr('Who can see it', 'من يمكنه رؤيتها')}</Label>
          <Select value={form.visibility} onValueChange={(v) => set('visibility', v)}>
            <SelectTrigger id={`${id}-visibility`}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="public">{tr('Everyone (public lobby)', 'الجميع (الردهة العامة)')}</SelectItem>
              <SelectItem value="restricted">{tr('Only invited viewers', 'المدعوون فقط')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-audience`}>{tr('Who plays', 'من يلعب')}</Label>
          <Select value={form.audience} disabled={audienceLocked} onValueChange={(v) => set('audience', v)}>
            <SelectTrigger id={`${id}-audience`}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="followers">{tr('Followers: comments, tags and likes on posts', 'المتابعون: تعليقات ووسوم وإعجابات على المنشورات')}</SelectItem>
              <SelectItem value="creators">{tr('Influencers: shares, views and growth on their own posts', 'المؤثرون: مشاركات ومشاهدات ونمو على منشوراتهم')}</SelectItem>
            </SelectContent>
          </Select>
          {audienceLocked && <p className="text-xs text-muted-foreground">{tr('Fixed once published.', 'ثابت بعد النشر.')}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-tag`}>{tr('Game tag (@handle or #hashtag)', 'وسم اللعبة (@حساب أو #وسم)')}</Label>
          <Input id={`${id}-tag`} dir="ltr" placeholder="#RamadanWithAlNoor" value={form.tag} onChange={(e) => set('tag', e.target.value)} aria-invalid={!tagOk} />
          <p className={`text-xs ${tagOk ? 'text-muted-foreground' : 'text-destructive'}`}>
            {tagOk ? tr('Influencer posts count when their caption has it. Needed for influencer games.', 'تُحتسب منشورات المؤثرين التي تتضمنه. مطلوب لألعاب المؤثرين.') : tr('One @handle or #hashtag, no spaces.', 'حساب @ أو وسم # واحد دون مسافات.')}
          </p>
        </div>
        {field('startsAt', tr('Starts', 'تبدأ'), { type: 'datetime-local', dir: 'ltr' })}
        {field('endsAt', tr('Ends', 'تنتهي'), { type: 'datetime-local', dir: 'ltr' })}
        {field('rules', tr('Rules (English)', 'القواعد (بالإنجليزية)'), { area: true })}
        {field('rulesAr', tr('Rules (Arabic)', 'القواعد (بالعربية)'), { area: true })}
        {field('prize', tr('Prize (English)', 'الجائزة (بالإنجليزية)'))}
        {field('prizeAr', tr('Prize (Arabic)', 'الجائزة (بالعربية)'))}
      </div>
      <p className="text-xs text-muted-foreground">
        {tr('A game with a prize needs legal sign-off and must follow each platform\'s promotion rules before it goes live.', 'اللعبة ذات الجائزة تحتاج موافقة قانونية ويجب أن تتبع قواعد الترويج لكل منصة قبل إطلاقها.')}
      </p>
      <div className="flex justify-end gap-2">
        {onCancel && <Button type="button" variant="ghost" onClick={onCancel}>{tr('Cancel', 'إلغاء')}</Button>}
        <Button type="submit" disabled={busy || !valid}>{game ? tr('Save changes', 'حفظ التغييرات') : tr('Create game', 'إنشاء اللعبة')}</Button>
      </div>
    </form>
  );
}

/** Results as a spreadsheet: rank, handle, points and each metric's share, for contacting winners. */
function downloadCsv(game: Game, board: BoardRow[], labelOf: (key: string) => string) {
  const keys = [...new Set(board.flatMap((r) => Object.keys(r.breakdown ?? {})))];
  const cell = (v: unknown) => {
    const text = String(v ?? '');
    // Leading = + - @ would run as a formula in Excel/Sheets.
    const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
    return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const rows = [
    ['rank', 'platform', 'handle', 'points', ...keys.map(labelOf), 'excluded', 'flags'],
    ...board.map((r) => [r.rank ?? '', r.platform, r.handle, r.points, ...keys.map((k) => r.breakdown?.[k] ?? 0), r.excluded ?? '', (r.flags ?? []).join(' ')]),
  ];
  const blob = new Blob(['\uFEFF' + rows.map((row) => row.map(cell).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${game.slug}-results.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function GameDetail({ companyId, game, tr, language, onChange, onError }: {
  companyId: string; game: Game; tr: Tr; language: string; onChange: (g: Game) => void; onError: (e: unknown) => void;
}) {
  const id = React.useId();
  const [board, setBoard] = React.useState<BoardRow[]>([]);
  const [awards, setAwards] = React.useState<AwardRow[]>([]);
  const [editing, setEditing] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [award, setAward] = React.useState({ platform: 'instagram', handle: '', points: '', reason: '' });
  const [rule, setRule] = React.useState({ platform: 'instagram', handle: '', kind: 'disqualify' as 'exclude' | 'disqualify', reason: '' });
  const [reopen, setReopen] = React.useState({ reason: '', endsAt: '' });
  const locked = Boolean(game.frozenAt) || game.status === 'archived';
  const labelOf = (key: string) => {
    const m = game.availableMetrics.find((x) => x.key === key);
    return m ? (language === 'ar' ? m.label.ar : m.label.en) : key;
  };

  const refresh = React.useCallback(async () => {
    try {
      const [b, a] = await Promise.all([getScoreboard(companyId, game.id), listAwards(companyId, game.id)]);
      setBoard(b);
      setAwards(a);
    } catch (error) { onError(error); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, game.id]);
  React.useEffect(() => { void refresh(); }, [refresh]);

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try { await fn(); await refresh(); } catch (error) { onError(error); } finally { setBusy(false); }
  };

  const select = (value: string, onValue: (v: string) => void, labelId: string) => (
    <Select value={value} onValueChange={onValue}>
      <SelectTrigger id={labelId}><SelectValue /></SelectTrigger>
      <SelectContent>{PLATFORMS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
    </Select>
  );

  if (editing) {
    return <GameForm tr={tr} game={game} onCancel={() => setEditing(false)} onSave={async (input) => {
      try { onChange(await updateGame(companyId, game.id, input)); setEditing(false); } catch (error) { onError(error); }
    }} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 dir="auto" className="text-xl font-semibold">{(language === 'ar' && game.nameAr) || game.name}</h2>
          <p className="text-sm text-muted-foreground">
            {statusLabel(tr, game.status)} · {new Date(game.startsAt).toLocaleString()} → {new Date(game.endsAt).toLocaleString()}
            {game.frozenAt && ` · ${tr('results frozen', 'النتائج مجمدة')}`}
            {game.tag && <> · <span dir="ltr">{game.tag}</span></>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!locked && <Button size="sm" variant="outline" onClick={() => setEditing(true)}>{tr('Edit', 'تعديل')}</Button>}
          {game.status === 'draft' && <Button size="sm" disabled={busy} onClick={() => act(async () => onChange(await publishGame(companyId, game.id)))}>{tr('Publish', 'نشر')}</Button>}
          {game.status !== 'archived' && (
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => act(async () => onChange(await archiveGame(companyId, game.id)))}>{tr('Archive', 'أرشفة')}</Button>
          )}
          {game.publishedAt && game.visibility === 'public' && game.status !== 'archived' && (
            <Button size="sm" variant="ghost" asChild>
              <a href={`${LOBBY_URL}/games/${game.slug}`} target="_blank" rel="noopener noreferrer"><ExternalLink className="me-1 h-4 w-4" />{tr('View', 'عرض')}</a>
            </Button>
          )}
        </div>
      </div>

      <GameClientPicker companyId={companyId} game={game} tr={tr} onChange={onChange} onError={onError} />
      {game.visibility === 'restricted' && <GameViewersPicker companyId={companyId} game={game} tr={tr} onError={onError} />}
      <GameLivePanel companyId={companyId} game={game} tr={tr} locked={locked} onChange={onChange} onError={onError} onCollected={() => void refresh()} />
      <GameMetricsEditor companyId={companyId} game={game} tr={tr} language={language} locked={locked} onChange={(g) => { onChange(g); void refresh(); }} onError={onError} />

      {!locked && (
        <div className="grid gap-4 2xl:grid-cols-2">
          <form
            className="space-y-3 rounded-md border p-3"
            onSubmit={(e) => { e.preventDefault(); void act(async () => { await awardPoints(companyId, game.id, { ...award, points: Number(award.points) }); setAward((a) => ({ ...a, handle: '', points: '' })); }); }}
          >
            <h3 className="text-sm font-semibold">{tr('Award points', 'منح نقاط')}</h3>
            <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-2">
              <div className="space-y-1"><Label htmlFor={`${id}-ap`} className="text-xs">{tr('Platform', 'المنصة')}</Label>{select(award.platform, (v) => setAward((a) => ({ ...a, platform: v })), `${id}-ap`)}</div>
              <div className="space-y-1"><Label htmlFor={`${id}-ah`} className="text-xs">{tr('Handle', 'اسم المستخدم')}</Label><Input id={`${id}-ah`} dir="ltr" value={award.handle} onChange={(e) => setAward((a) => ({ ...a, handle: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-2">
              <div className="space-y-1"><Label htmlFor={`${id}-apt`} className="text-xs">{tr('Points', 'النقاط')}</Label><Input id={`${id}-apt`} type="number" inputMode="numeric" value={award.points} onChange={(e) => setAward((a) => ({ ...a, points: e.target.value }))} /></div>
              <div className="space-y-1"><Label htmlFor={`${id}-ar`} className="text-xs">{tr('Reason', 'السبب')}</Label><Input id={`${id}-ar`} dir="auto" value={award.reason} onChange={(e) => setAward((a) => ({ ...a, reason: e.target.value }))} /></div>
            </div>
            <p className="text-xs text-muted-foreground">{tr('Awards cannot be edited. Use negative points to correct one.', 'لا يمكن تعديل النقاط الممنوحة. استخدم نقاطًا سالبة للتصحيح.')}</p>
            <div className="flex justify-end"><Button size="sm" type="submit" disabled={busy || !award.handle.trim() || !Number(award.points) || award.reason.trim().length < 3}>{tr('Award', 'منح')}</Button></div>
          </form>

          <form
            className="space-y-3 rounded-md border p-3"
            onSubmit={(e) => { e.preventDefault(); void act(async () => { await setActorRule(companyId, game.id, rule); setRule((r) => ({ ...r, handle: '', reason: '' })); }); }}
          >
            <h3 className="text-sm font-semibold">{tr('Exclude or disqualify', 'استبعاد أو إقصاء')}</h3>
            <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-2">
              <div className="space-y-1"><Label htmlFor={`${id}-rp`} className="text-xs">{tr('Platform', 'المنصة')}</Label>{select(rule.platform, (v) => setRule((r) => ({ ...r, platform: v })), `${id}-rp`)}</div>
              <div className="space-y-1"><Label htmlFor={`${id}-rh`} className="text-xs">{tr('Handle', 'اسم المستخدم')}</Label><Input id={`${id}-rh`} dir="ltr" value={rule.handle} onChange={(e) => setRule((r) => ({ ...r, handle: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-2">
              <div className="space-y-1">
                <Label htmlFor={`${id}-rk`} className="text-xs">{tr('Kind', 'النوع')}</Label>
                <Select value={rule.kind} onValueChange={(v) => setRule((r) => ({ ...r, kind: v as 'exclude' | 'disqualify' }))}>
                  <SelectTrigger id={`${id}-rk`}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="disqualify">{tr('Disqualify', 'إقصاء')}</SelectItem>
                    <SelectItem value="exclude">{tr('Exclude (staff, brand)', 'استبعاد (موظف، علامة)')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label htmlFor={`${id}-rr`} className="text-xs">{tr('Reason (internal)', 'السبب (داخلي)')}</Label><Input id={`${id}-rr`} dir="auto" value={rule.reason} onChange={(e) => setRule((r) => ({ ...r, reason: e.target.value }))} /></div>
            </div>
            <div className="flex justify-end"><Button size="sm" type="submit" variant="outline" disabled={busy || !rule.handle.trim() || rule.reason.trim().length < 3}>{tr('Save rule', 'حفظ القاعدة')}</Button></div>
          </form>
        </div>
      )}

      {game.frozenAt && (
        <form
          className="space-y-3 rounded-md border border-destructive/40 p-3"
          onSubmit={(e) => { e.preventDefault(); void act(async () => onChange(await reopenGame(companyId, game.id, reopen.reason, new Date(reopen.endsAt).toISOString()))); }}
        >
          <h3 className="text-sm font-semibold">{tr('Reopen results', 'إعادة فتح النتائج')}</h3>
          <p className="text-xs text-muted-foreground">{tr('Only to correct a mistake. The reason is kept in the activity log.', 'للتصحيح فقط. يُحفظ السبب في سجل النشاط.')}</p>
          <div className="grid gap-2 sm:grid-cols-[1fr_220px]">
            <div className="space-y-1"><Label htmlFor={`${id}-or`} className="text-xs">{tr('Reason', 'السبب')}</Label><Input id={`${id}-or`} dir="auto" value={reopen.reason} onChange={(e) => setReopen((r) => ({ ...r, reason: e.target.value }))} /></div>
            <div className="space-y-1"><Label htmlFor={`${id}-oe`} className="text-xs">{tr('New end', 'النهاية الجديدة')}</Label><Input id={`${id}-oe`} type="datetime-local" dir="ltr" value={reopen.endsAt} onChange={(e) => setReopen((r) => ({ ...r, endsAt: e.target.value }))} /></div>
          </div>
          <div className="flex justify-end"><Button size="sm" type="submit" variant="destructive" disabled={busy || reopen.reason.trim().length < 10 || !reopen.endsAt}>{tr('Reopen', 'إعادة فتح')}</Button></div>
        </form>
      )}

      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">{tr('Scoreboard', 'لوحة النقاط')}</h3>
          {board.length > 0 && (
            <Button size="sm" variant="ghost" onClick={() => downloadCsv(game, board, labelOf)}>
              <Download className="me-1.5 h-4 w-4" />{tr('Download CSV', 'تنزيل CSV')}
            </Button>
          )}
        </div>
        {board.some((r) => r.flags?.length) && (
          <p className="text-xs text-muted-foreground">
            {tr('Flags are hints to review, not penalties: “same text” means 3 or more accounts posted identical comments; “burst” means 8 or more interactions within a minute. Exclude or disqualify after checking.',
              'العلامات تنبيهات للمراجعة وليست عقوبات: «نص مكرر» يعني أن 3 حسابات أو أكثر نشرت التعليق نفسه؛ «دفعة» تعني 8 تفاعلات أو أكثر خلال دقيقة. استبعد أو أقصِ بعد التحقق.')}
          </p>
        )}
        {board.length === 0 ? <p className="text-sm text-muted-foreground">{tr('No points yet.', 'لا نقاط بعد.')}</p> : (
          <ol className="divide-y rounded-md border">
            {board.map((r) => (
              <li key={r.actorKey} className={`flex flex-wrap items-center gap-3 p-2 text-sm ${r.excluded ? 'opacity-60' : ''}`}>
                <span className="w-8 text-end font-semibold">{r.rank ?? '–'}</span>
                <span className="min-w-0 flex-1">
                  <span dir="ltr">@{r.handle}</span> <span className="text-xs text-muted-foreground">{r.platform}</span>
                  {r.breakdown && Object.keys(r.breakdown).length > 1 && (
                    <span className="mt-0.5 block text-xs text-muted-foreground tabular-nums">
                      {Object.entries(r.breakdown).map(([k, v]) => `${labelOf(k)} ${Number(v.toFixed(2))}`).join(' · ')}
                    </span>
                  )}
                </span>
                {(r.flags ?? []).map((f) => (
                  <Badge key={f} variant="outline" className="border-amber-500/60 text-amber-700 dark:text-amber-400">
                    {f === 'same_text' ? tr('Same text', 'نص مكرر') : tr('Burst', 'دفعة')}
                  </Badge>
                ))}
                {r.excluded && (
                  <span className="flex items-center gap-2">
                    <Badge variant="destructive" title={r.excludedReason ?? undefined}>{r.excluded === 'disqualify' ? tr('Disqualified', 'مُقصى') : tr('Excluded', 'مستبعد')}</Badge>
                    {!locked && <Button size="sm" variant="ghost" disabled={busy} onClick={() => act(() => removeActorRule(companyId, game.id, r.actorKey))}>{tr('Restore', 'استعادة')}</Button>}
                  </span>
                )}
                <span className="w-16 text-end font-semibold tabular-nums">{r.points}</span>
              </li>
            ))}
          </ol>
        )}
      </section>

      {awards.length > 0 && (
        <details className="rounded-md border p-3">
          <summary className="cursor-pointer text-sm font-semibold">{tr('Award history', 'سجل النقاط')} ({awards.length})</summary>
          <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
            {awards.map((a) => (
              <li key={a.id} dir="auto">
                {new Date(a.createdAt).toLocaleString()} · <span dir="ltr">@{a.actorHandle}</span> · {a.points > 0 ? `+${a.points}` : a.points} · {a.reason} · {a.by ?? '-'}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
