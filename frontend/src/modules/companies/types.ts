import type { CompanyBranding } from '@/modules/branding/brand';

export interface Company {
  id: string;
  name: string;
  website?: string;
  address?: string;
  logoUrl?: string;
  legalName?: string;
  taxNumber?: string;
  payrollAccount?: string;
  payrollBankCode?: string;
  registrationNumber?: string;
  phone?: string;
  email?: string;
  city?: string;
  country?: string;
  taxDetails?: string;
  /** Modules the platform super admin switched off for this company. */
  disabledModules?: string[];
  /** A TaskFlow Academy practice company (only its trainee sees it). */
  isTraining?: boolean;
  trainingOwnerUserId?: string;
  /** The company's own look in the app; absent = TaskFlow's. */
  branding?: CompanyBranding;
  /** The group company this one sits under; absent = a top company. */
  parentCompanyId?: string;
}

export interface Position {
    id: string;
    title: string;
    companyId?: string;
}
