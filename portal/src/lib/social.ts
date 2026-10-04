import { portalGet } from './client-api';
import type { SocialAccount } from './social-types';

export const getSocialAccounts = () => portalGet<SocialAccount[]>('/social');
