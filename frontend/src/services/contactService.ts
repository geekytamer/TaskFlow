import { apiFetch } from '@/lib/api-client';

export type ContactKind = 'Organization' | 'Person';
export type ContactRoleType = 'Lead' | 'Client' | 'Vendor' | 'Influencer' | 'Partner';

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
  };
  invoices: any[];
  salesOrders: any[];
  purchaseOrders: any[];
  vendorBills: any[];
  opportunities: any[];
  projects: any[];
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

export async function updateContact(id: string, updates: Partial<Omit<Contact, 'id' | 'companyId' | 'createdAt'>>): Promise<Contact> {
  const data = await apiFetch<any>(`/contacts/${id}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
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
