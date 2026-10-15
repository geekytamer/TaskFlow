/**
 * The server refuses a permanent opportunity delete with 409 and a
 * `dependents` map ({ commissions: 1, ... }); this words it in the app's
 * language. Unknown keys are ignored, so a newer server never shows raw keys.
 */
const KINDS: Record<string, { en: [string, string]; ar: string }> = {
  commissions: { en: ['commission', 'commissions'], ar: 'عمولات' },
  campaigns: { en: ['campaign', 'campaigns'], ar: 'حملات' },
  quotations: { en: ['quotation', 'quotations'], ar: 'عروض أسعار' },
  portalRequests: { en: ['portal campaign request', 'portal campaign requests'], ar: 'طلبات حملات من البوابة' },
  portalReferrals: { en: ['portal referral', 'portal referrals'], ar: 'إحالات من البوابة' },
  acceptedProposals: { en: ['accepted proposal', 'accepted proposals'], ar: 'عروض مقبولة' },
  wonSalesOrder: { en: ['won sales order', 'won sales orders'], ar: 'أمر بيع ناتج عن الفوز' },
};

export function opportunityRefusal(dependents: unknown, lang: 'en' | 'ar'): string | null {
  if (!dependents || typeof dependents !== 'object') return null;
  const known = Object.entries(dependents as Record<string, unknown>)
    .filter(([key, count]) => KINDS[key] && typeof count === 'number' && count > 0) as Array<[string, number]>;
  if (!known.length) return null;
  if (lang === 'ar') {
    const list = known.map(([key, n]) => `${KINDS[key].ar} (${n})`).join('، ');
    return `ما زالت مرتبطة بـ: ${list}. ألغِ الفرصة بدلاً من ذلك، أو احذف هذه السجلات أولاً.`;
  }
  const parts = known.map(([key, n]) => `${n} ${KINDS[key].en[n === 1 ? 0 : 1]}`);
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts[0];
  return `It still has ${list}. Cancel it instead, or remove those first.`;
}
