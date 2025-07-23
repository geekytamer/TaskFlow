'use client';

import * as React from 'react';
import type { Company } from '@/modules/companies/types';
import { placeholderCompanies } from '@/modules/companies/data';

interface CompanyContextType {
  selectedCompany: Company | null;
  setSelectedCompany: (company: Company | null) => void;
  companies: Company[];
}

const CompanyContext = React.createContext<CompanyContextType | undefined>(undefined);

export function CompanyProvider({ children }: { children: React.ReactNode }) {
  const [companies] = React.useState<Company[]>(placeholderCompanies);
  const [selectedCompany, setSelectedCompany] = React.useState<Company | null>(() => {
    if (typeof window !== 'undefined') {
      const storedCompanyId = localStorage.getItem('selectedCompanyId');
      return companies.find(c => c.id === storedCompanyId) || companies[0] || null;
    }
    return companies[0] || null;
  });

  const handleSetSelectedCompany = (company: Company | null) => {
    setSelectedCompany(company);
    if (company) {
      localStorage.setItem('selectedCompanyId', company.id);
    } else {
      localStorage.removeItem('selectedCompanyId');
    }
  };

  const value = {
    selectedCompany,
    setSelectedCompany: handleSetSelectedCompany,
    companies
  };

  return (
    <CompanyContext.Provider value={value}>
      {children}
    </CompanyContext.Provider>
  );
}

export function useCompany() {
  const context = React.useContext(CompanyContext);
  if (context === undefined) {
    throw new Error('useCompany must be used within a CompanyProvider');
  }
  return context;
}
