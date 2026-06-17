export interface Company {
  id: string;
  name: string;
  website?: string;
  address?: string;
  logoUrl?: string;
  legalName?: string;
  taxNumber?: string;
  registrationNumber?: string;
  phone?: string;
  email?: string;
  city?: string;
  country?: string;
  taxDetails?: string;
}

export interface Position {
    id: string;
    title: string;
    companyId?: string;
}
