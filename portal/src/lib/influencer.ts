import { portalGet } from './client-api';
import type { Assignment, Payout, Profile } from './influencer-types';

export * from './influencer-types';

export const getProfile = () => portalGet<Profile>('/profile');
export const getAssignments = () => portalGet<Assignment[]>('/assignments');
export const getPayouts = () => portalGet<Payout[]>('/payouts');
