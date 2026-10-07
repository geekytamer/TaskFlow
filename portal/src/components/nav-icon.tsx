import type { NavIcon as Name } from '@/lib/nav';

/** One drawn icon set: 24px grid, 1.75 stroke, round joins. */
const PATHS: Record<Name | 'more', string[]> = {
  home: ['M4 10.5 12 4l8 6.5', 'M6 9v10h4.5v-5h3v5H18V9'],
  campaigns: ['M4 6.5h16v11H4z', 'M4 10h16', 'M8.5 14h3'],
  creators: ['M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z', 'M3 20c.6-3.4 3-5.5 6-5.5s5.4 2.1 6 5.5', 'M16 4.6a3.4 3.4 0 0 1 0 6.3', 'M18.4 14.9c1.4.9 2.3 2.6 2.6 5.1'],
  requests: ['M7 3.5h7.5L19 8v12.5H7z', 'M14 3.5V8h5', 'M10 12.5h6', 'M10 16h4'],
  messages: ['M4.5 5.5h15v10h-8l-4.5 3.5v-3.5h-2.5z'],
  billing: ['M6 3.5h12v17l-3-2-3 2-3-2-3 2z', 'M9 8.5h6', 'M9 12h6'],
  analytics: ['M4 20h16', 'M7 16.5V11', 'M12 16.5V6.5', 'M17 16.5v-4'],
  games: ['M8 4.5h8v3a4 4 0 0 1-8 0z', 'M8 6H5a3 3 0 0 0 3 3.5', 'M16 6h3a3 3 0 0 1-3 3.5', 'M12 11.5V16', 'M8.5 20h7l-.5-4h-6z'],
  referrals: ['M8 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z', 'M3.5 19c.5-3 2.3-4.8 4.5-4.8s4 1.8 4.5 4.8', 'M17 8.5v6', 'M14 11.5h6'],
  assignments: ['M5 4.5h14v15H5z', 'M8.5 9l1.5 1.5 3-3', 'M8.5 15h7'],
  payouts: ['M3.5 7h17v10h-17z', 'M12 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z', 'M6.5 10v4', 'M17.5 10v4'],
  deals: ['M4 8h16v11H4z', 'M9 8V5.5h6V8', 'M4 13h16'],
  contacts: ['M4 5.5h16v13H4z', 'M9.5 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z', 'M6.5 16c.4-1.6 1.6-2.5 3-2.5s2.6.9 3 2.5', 'M15 10h3', 'M15 13.5h3'],
  profile: ['M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z', 'M4.5 20.5c.8-4 3.7-6.5 7.5-6.5s6.7 2.5 7.5 6.5'],
  more: ['M5 12h.01', 'M12 12h.01', 'M19 12h.01'],
};

export function NavIcon({ name, className = 'h-6 w-6' }: { name: Name | 'more'; className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={name === 'more' ? 3 : 1.75} strokeLinecap="round" strokeLinejoin="round">
      {PATHS[name].map((d) => <path key={d} d={d} />)}
    </svg>
  );
}
