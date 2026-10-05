/** Browser safe. The report a brand reads about a game run for it. */
import type { GameStatus } from './games';

export interface BrandGameSummary {
  slug: string; name: string; nameAr: string | null; status: GameStatus | 'draft' | 'archived'; startsAt: string; endsAt: string; players: number;
}

export interface BrandGameReport {
  game: {
    slug: string; name: string; nameAr: string | null; rules: string | null; rulesAr: string | null; prize: string | null; prizeAr: string | null;
    status: GameStatus; startsAt: string; endsAt: string; audience: 'followers' | 'creators'; tag: string | null; updatedAt: string | null; frozen: boolean;
  };
  players: number;
  totals: Record<string, number>;
  daily: Array<{ date: string; comments: number; replies: number; tags: number; likes: number }>;
  posts: Array<{ url: string; kind: 'comment' | 'like' }>;
  topFans: Array<{ rank: number; handle: string; points: number }>;
  winners: Array<{ rank: number; handle: string; points: number }> | null;
}
