import { ApiError, apiFetch } from '@/lib/api-client';

export type ContactKind = 'Organization' | 'Person';
export type ContactRoleType = 'Lead' | 'Client' | 'Vendor' | 'Influencer' | 'Partner';

export type InfluencerPlatform = 'Instagram' | 'TikTok' | 'Snapchat' | 'Facebook' | 'YouTube' | 'X' | 'Other';
export const influencerPlatforms: InfluencerPlatform[] = ['Instagram', 'TikTok', 'Snapchat', 'Facebook', 'YouTube', 'X', 'Other'];

export interface InfluencerAccount {
  id: string;
  platform: InfluencerPlatform;
  handle?: string;
  url?: string;
  followers?: number;
  avgViews?: number;
  engagementRate?: number;
  /** Manual estimate of average reach/impressions, set by the employee. */
  estimatedAvg?: number;
  notes?: string;
  /** When followers and engagement were last updated from Instagram by the Discover directory. */
  syncedAt?: string;
}

export type PayoutMethod = 'Bank transfer' | 'Cash' | 'Wallet' | 'Other';
export const payoutMethods: PayoutMethod[] = ['Bank transfer', 'Cash', 'Wallet', 'Other'];

/** One way to pay a contact (backend types.ts PayoutAccount). */
export interface PayoutAccount {
  id: string;
  method: PayoutMethod;
  accountHolder?: string;
  bankName?: string;
  accountNumber?: string;
  iban?: string;
  swift?: string;
  currency?: string;
  walletNumber?: string;
  notes?: string;
  isDefault?: boolean;
}

export interface Contact {
  id: string;
  companyId: string;
  kind: ContactKind;
  name: string;
  legalName?: string;
  contactPerson?: string;
  email?: string;
  phone?: string;
  address?: string;
  taxNumber?: string;
  tags?: string[];
  notes?: string;
  roles?: ContactRoleType[];
  clientId?: string;
  supplierId?: string;
  influencerPlatform?: string;
  influencerHandle?: string;
  influencerNiche?: string;
  followerCount?: number;
  engagementRate?: number;
  rateCardAmount?: number;
  location?: string;
  languages?: string[];
  availabilityStatus?: string;
  influencerAccounts?: InfluencerAccount[];
  /** Where we pay the contact; absent when the person's role hides payment details. */
  payoutAccounts?: PayoutAccount[];
  // CRM fields
  leadStatus?: 'New' | 'Qualified' | 'Follow-up' | 'Proposal' | 'Won' | 'Lost' | 'Archived';
  leadSource?: 'Instagram' | 'TikTok' | 'WhatsApp' | 'Referral' | 'Website' | 'Campaign' | 'Former Client' | 'Other';
  priority?: 'High' | 'Medium' | 'Low';
  ownerUserId?: string;
  ownerName?: string;
  nextFollowupDate?: Date;
  nextFollowupNote?: string;
  convertedToClientAt?: Date;
  visibility?: 'Public' | 'Private';
  customFields?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const toDate = (v: any) => (v ? new Date(v) : undefined);

function decodeContact(raw: any): Contact {
  return {
    ...raw,
    createdAt: toDate(raw.createdAt) ?? new Date(),
      updatedAt: toDate(raw.updatedAt) ?? new Date(),
      nextFollowupDate: toDate(raw.nextFollowupDate),
      convertedToClientAt: toDate(raw.convertedToClientAt),
    };
  }

export interface ContactSummary {
  contact: Contact;
  totals: {
    invoiceCount: number;
    invoiceOutstanding: number;
    invoiceTotal: number;
    salesOrderCount: number;
    salesOrderTotal: number;
    purchaseOrderCount: number;
    vendorBillCount: number;
    vendorBillOutstanding: number;
    opportunityCount: number;
    projectCount: number;
    /** Older servers leave these out. */
    vendorBillPaid?: number;
    campaignCount?: number;
    deliverableCount?: number;
    quotationCount?: number;
  };
  invoices: any[];
  salesOrders: any[];
  purchaseOrders: any[];
  vendorBills: any[];
  opportunities: any[];
  projects: any[];
  campaigns?: Array<{ id: string; name: string; status: string; startDate?: string; endDate?: string; relation: 'client' | 'work' }>;
  /** Campaign pieces the contact is paid for; `cost` absent without rate cards. */
  deliverables?: Array<{ id: string; campaignId: string; campaignName: string; title: string; platform: string | null; status: string; dueDate: string | null; cost?: number | null; vendorBillId: string | null }>;
  quotations?: any[];
}

export async function getContactSummary(id: string): Promise<ContactSummary> {
  const data = await apiFetch<any>(`/contacts/${id}/summary`);
  return { ...data, contact: decodeContact(data.contact) };
}

export async function getContacts(companyId: string, role?: ContactRoleType): Promise<Contact[]> {
  const params = role ? `?role=${encodeURIComponent(role)}` : '';
  const data = await apiFetch<any[]>(`/companies/${companyId}/contacts${params}`);
  return data.map(decodeContact);
}

export async function getContact(id: string): Promise<Contact> {
  const data = await apiFetch<any>(`/contacts/${id}`);
  return decodeContact(data);
}

export async function createContact(input: {
  companyId: string;
  kind?: ContactKind;
  name: string;
  legalName?: string;
  contactPerson?: string;
  email?: string;
  phone?: string;
  address?: string;
	  taxNumber?: string;
	  tags?: string[];
	  notes?: string;
	  roles?: ContactRoleType[];
	  leadStatus?: Contact['leadStatus'];
	  leadSource?: Contact['leadSource'];
	  priority?: Contact['priority'];
	  ownerUserId?: string;
	  ownerName?: string;
	  nextFollowupDate?: Date;
	  nextFollowupNote?: string;
	  influencerPlatform?: string;
	  influencerHandle?: string;
	  influencerNiche?: string;
	  followerCount?: number;
	  engagementRate?: number;
	  rateCardAmount?: number;
	  location?: string;
	  languages?: string[];
	  availabilityStatus?: string;
	  influencerAccounts?: InfluencerAccount[];
	  customFields?: Record<string, unknown>;
	}): Promise<Contact> {
	  const data = await apiFetch<any>(`/companies/${input.companyId}/contacts`, {
	    method: 'POST',
	    body: JSON.stringify({
	      ...input,
	      nextFollowupDate: input.nextFollowupDate?.toISOString(),
	    }),
	  });
  return decodeContact(data);
}

/** Changes a contact. null clears a field (an emptied input); leaving a field out keeps it. */
export async function updateContact(
  id: string,
  updates: { [K in keyof Omit<Contact, 'id' | 'companyId' | 'createdAt'>]?: Contact[K] | null },
): Promise<Contact> {
  const data = await apiFetch<any>(`/contacts/${id}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  });
  return decodeContact(data);
}

/** Replaces where we pay a contact (management, with the payout_details field). */
export async function setPayoutAccounts(id: string, payoutAccounts: Array<Partial<PayoutAccount>>): Promise<Contact> {
  const data = await apiFetch<any>(`/contacts/${id}/payout-accounts`, {
    method: 'PUT',
    body: JSON.stringify({ payoutAccounts }),
  });
  return decodeContact(data);
}

export async function addContactRole(id: string, role: ContactRoleType): Promise<Contact> {
  const data = await apiFetch<any>(`/contacts/${id}/roles`, {
    method: 'POST',
    body: JSON.stringify({ role }),
  });
  return decodeContact(data);
}

export async function removeContactRole(id: string, role: ContactRoleType): Promise<Contact> {
  const data = await apiFetch<any>(`/contacts/${id}/roles/${role}`, {
    method: 'DELETE',
  });
  return decodeContact(data);
}

export async function deleteContact(id: string): Promise<void> {
  await apiFetch<void>(`/contacts/${id}`, { method: 'DELETE' });
}

export type QuickAddStatus = 'created' | 'existing' | 'invalid';
export interface QuickAddResult { line: string; status: QuickAddStatus; contact?: { id: string; name: string } }

/** One influencer per pasted line; handles already on a record answer with that record. */
export const quickAddInfluencers = (companyId: string, text: string) =>
  apiFetch<{ results: QuickAddResult[]; fetching: boolean }>(`/companies/${encodeURIComponent(companyId)}/influencers/quick-add`, {
    method: 'POST',
    body: JSON.stringify({ text }),
  });

/** The record that already has a handle, when a save was refused for it. */
export function duplicateHandleOf(error: unknown): { id: string; name: string } | null {
  if (!(error instanceof ApiError) || error.status !== 409) return null;
  const details = error.details as { code?: string; duplicateOf?: { id: string; name: string } } | undefined;
  return details?.code === 'duplicate_handle' && details.duplicateOf ? details.duplicateOf : null;
}
