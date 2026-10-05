/** Browser safe. What waits on the client, ranked: money owed first, then answers, then reviews. */
export type NeedsYouItem =
  | { key: string; kind: 'overdue'; href: string; title: string; amount: number; currency: string; daysLate: number }
  | { key: string; kind: 'proposal'; href: string; title: string }
  | { key: string; kind: 'review'; href: string; title: string; count: number };

export function rankNeedsYou(input: {
  overdue: Array<{ id: string; number: string; outstanding: number; currency: string; daysLate: number }>;
  proposals: Array<{ id: string; title: string }>;
  reviews: Array<{ campaignId: string; name: string; count: number }>;
}): NeedsYouItem[] {
  return [
    ...[...input.overdue].sort((a, b) => b.daysLate - a.daysLate).map((i) => ({
      key: `invoice:${i.id}`, kind: 'overdue' as const, href: `/billing/${i.id}`, title: i.number, amount: i.outstanding, currency: i.currency, daysLate: i.daysLate,
    })),
    ...input.proposals.map((p) => ({ key: `proposal:${p.id}`, kind: 'proposal' as const, href: `/proposals/${p.id}`, title: p.title })),
    ...input.reviews.filter((r) => r.count > 0).map((r) => ({ key: `review:${r.campaignId}`, kind: 'review' as const, href: `/campaigns/${r.campaignId}`, title: r.name, count: r.count })),
  ];
}
