import type { Audience } from './audience';
import type { Key } from './i18n';

/** Browser safe: the shell's client components read this. */
export type NavIcon =
  | 'home' | 'campaigns' | 'creators' | 'requests' | 'messages' | 'billing' | 'analytics' | 'games' | 'referrals'
  | 'assignments' | 'payouts' | 'profile';

export interface NavEntry { href: string; label: Key; icon: NavIcon }

const ITEMS: Record<string, NavEntry> = {
  home: { href: '/', label: 'nav.overview', icon: 'home' },
  campaigns: { href: '/campaigns', label: 'nav.campaigns', icon: 'campaigns' },
  creators: { href: '/influencers', label: 'nav.influencers', icon: 'creators' },
  requests: { href: '/requests', label: 'nav.requests', icon: 'requests' },
  messages: { href: '/messages', label: 'nav.messages', icon: 'messages' },
  billing: { href: '/billing', label: 'nav.billing', icon: 'billing' },
  analytics: { href: '/analytics', label: 'nav.analytics', icon: 'analytics' },
  games: { href: '/games', label: 'nav.lobby', icon: 'games' },
  referrals: { href: '/referrals', label: 'nav.referrals', icon: 'referrals' },
  assignments: { href: '/assignments', label: 'nav.assignments', icon: 'assignments' },
  payouts: { href: '/payouts', label: 'nav.payouts', icon: 'payouts' },
  profile: { href: '/profile', label: 'nav.profile', icon: 'profile' },
};

/**
 * Desktop shows primary then secondary in a sidebar. Phones show `bar` as four
 * tabs plus More, which lists everything else, so every page stays reachable.
 */
export function navFor(audience: Audience): { primary: NavEntry[]; secondary: NavEntry[]; bar: NavEntry[] } {
  const i = ITEMS;
  return audience === 'client'
    ? {
      primary: [i.home, i.campaigns, i.creators, i.requests, i.messages],
      secondary: [i.billing, i.analytics, i.games, i.referrals],
      bar: [i.home, i.campaigns, i.creators, i.messages],
    }
    : {
      primary: [i.home, i.assignments, i.payouts, i.messages],
      secondary: [i.analytics, i.profile, i.games, i.referrals],
      bar: [i.home, i.assignments, i.payouts, i.messages],
    };
}

export const isActive = (href: string, pathname: string) =>
  href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
