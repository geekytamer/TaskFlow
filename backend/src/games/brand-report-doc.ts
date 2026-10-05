import { companyBlock, escapeHtml, page } from '../portal/billing-docs';
import type { brandGameReport } from './brand-report';

type Lang = 'en' | 'ar';
type Report = ReturnType<typeof brandGameReport>;

/** A cell a spreadsheet would run as a formula gets a leading quote. */
const cell = (value: string | number) => {
  const text = String(value);
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

/** Final results as CSV (UTF-8 with BOM so spreadsheets read Arabic handles), for contacting winners. */
export function resultsCsv(rows: Array<{ rank: number; handle: string; points: number }>): string {
  return `﻿${['rank,handle,points', ...rows.map((r) => [r.rank, r.handle, r.points].map(cell).join(','))].join('\r\n')}\r\n`;
}

const LABELS = {
  en: {
    title: 'Game summary', game: 'Game', dates: 'Dates', to: 'to', prize: 'Prize', players: 'Players', generated: 'Generated',
    interactions: 'Interactions', type: 'Type', count: 'Count', comments: 'Comments', replies: 'Replies', tags: 'Tags', likes: 'Likes',
    posts: 'Posts', views: 'Views', shares: 'Shares', engagement: 'Engagement', winners: 'Winners', topFans: 'Top fans',
    rank: 'Rank', handle: 'Handle', points: 'Points', none: 'Nobody scored.',
  },
  ar: {
    title: 'ملخص المسابقة', game: 'المسابقة', dates: 'المدة', to: 'إلى', prize: 'الجائزة', players: 'المشاركون', generated: 'تاريخ الإصدار',
    interactions: 'التفاعلات', type: 'النوع', count: 'العدد', comments: 'التعليقات', replies: 'الردود', tags: 'الإشارات', likes: 'الإعجابات',
    posts: 'المنشورات', views: 'المشاهدات', shares: 'المشاركات', engagement: 'التفاعل', winners: 'الفائزون', topFans: 'أكثر المتابعين تفاعلاً',
    rank: 'المركز', handle: 'الحساب', points: 'النقاط', none: 'لم يسجل أحد نقاطاً.',
  },
} as const;

const fmtNum = (n: number, lang: Lang) => new Intl.NumberFormat(lang === 'ar' ? 'ar-u-nu-latn' : 'en', { maximumFractionDigits: 2 }).format(n);
const fmtDate = (d: string, lang: Lang) => new Intl.DateTimeFormat(lang === 'ar' ? 'ar-u-nu-latn' : 'en', {
  dateStyle: 'medium', timeZone: process.env.PORTAL_TIME_ZONE ?? 'Asia/Muscat',
}).format(new Date(d));

/** A one-page summary of a finished game, escaped throughout, for the brand to keep or forward. */
export function gameSummaryHtml(input: { lang: Lang; company: { name: string; address?: string | null }; report: Report; generatedAt: Date }): string {
  const { lang, report } = input;
  const L = LABELS[lang];
  const g = report.game;
  const name = (lang === 'ar' && g.nameAr) || g.name;
  const prize = (lang === 'ar' && g.prizeAr) || g.prize;
  const totals = Object.entries(report.totals) as Array<[keyof typeof L, number]>;
  const ranked = (rows: Report['topFans']) => rows.length === 0 ? `<p class="muted">${L.none}</p>` : `<table>
<thead><tr><th>${L.rank}</th><th>${L.handle}</th><th class="num">${L.points}</th></tr></thead>
<tbody>${rows.map((r) => `<tr><td>${r.rank}</td><td><bdi dir="ltr">@${escapeHtml(r.handle)}</bdi></td><td class="num">${fmtNum(r.points, lang)}</td></tr>`).join('')}</tbody></table>`;
  return page(lang, `${L.title} ${name}`, `
<div class="head">${companyBlock(input.company)}<div><h1>${L.title}</h1><div class="muted">${L.generated}: <bdi>${fmtDate(input.generatedAt.toISOString(), lang)}</bdi></div></div></div>
<p><strong>${L.game}:</strong> <bdi dir="auto">${escapeHtml(name)}</bdi><br>
<strong>${L.dates}:</strong> <bdi>${fmtDate(g.startsAt, lang)}</bdi> ${L.to} <bdi>${fmtDate(g.endsAt, lang)}</bdi><br>
${prize ? `<strong>${L.prize}:</strong> <bdi dir="auto">${escapeHtml(prize)}</bdi><br>` : ''}
<strong>${L.players}:</strong> <bdi>${fmtNum(report.players, lang)}</bdi></p>
<h2>${L.interactions}</h2>
<table><thead><tr><th>${L.type}</th><th class="num">${L.count}</th></tr></thead>
<tbody>${totals.map(([k, v]) => `<tr><td>${L[k]}</td><td class="num">${fmtNum(v, lang)}</td></tr>`).join('')}</tbody></table>
${report.winners ? `<h2>${L.winners}</h2>${ranked(report.winners)}` : ''}
<h2>${L.topFans}</h2>${ranked(report.topFans)}`);
}
