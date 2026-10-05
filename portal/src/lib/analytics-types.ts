/** Browser safe. Shapes of the analytics answers for both audiences. */
export interface Totals { posts: number; views: number; likes: number; comments: number; saves: number; shares: number; engagements: number; perView: number | null }
export interface Breakdown { posts: number; views: number; engagements: number; perView: number | null }

export interface ClientAnalytics {
  range: { from: string | null; to: string | null };
  totals: Totals | null;
  weekly: Array<{ week: string; views: number; engagements: number }>;
  byCreator: Array<Breakdown & { name: string; handle: string | null }>;
  byPlatform: Array<Breakdown & { platform: string }>;
  byCampaign: Array<{ id: string; name: string; posts: number; views: number; engagements: number; cost: Array<{ currency: string; invoiced: number; perThousandViews: number | null; perEngagement: number | null }> }>;
  campaigns: Array<{ id: string; name: string }>;
}

export interface Figures { views: number; likes: number; comments: number; saves: number; shares: number }

export interface InfluencerAnalytics {
  range: { from: string | null; to: string | null };
  growth: { days: Array<{ date: string; followers: number; reach: number; views: number; engaged: number }>; change: { followers: number; reach: number; views: number; engaged: number } | null } | null;
  audience: { country: Record<string, number>; age: Record<string, number>; gender: Record<string, number> } | null;
  posts: Array<{ id: string; title: string; campaign: string | null; publishedAt: string; checkpoints: Partial<Record<'24h' | '7d' | '30d', Figures>> }>;
  averages: Figures | null;
  earnings: Array<{ month: string; currency: string; paid: number; pending: number }>;
}
