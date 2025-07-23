'use client';

import * as React from 'react';
import type { Company } from '@/modules/companies/types';
import { getCompanies } from '@/services/companyService';
import { Skeleton } from '@/components/ui/skeleton';

interface CompanyContextType {
  selectedCompany: Company | null;
  setSelectedCompany: (company: Company | null) => void;
  companies: Company[];
}

const CompanyContext = React.createContext<CompanyContextType | undefined>(undefined);

export function CompanyProvider({ children }: { children: React.ReactNode }) {
  const [companies, setCompanies] = React.useState<Company[]>([]);
  const [selectedCompany, setSelectedCompany] = React.useState<Company | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    async function fetchAndSetCompanies() {
      const companiesData = await getCompanies();
      setCompanies(companiesData);

      if (typeof window !== 'undefined') {
        const storedCompanyId = localStorage.getItem('selectedCompanyId');
        const companyToSelect = companiesData.find(c => c.id === storedCompanyId) || companiesData[0] || null;
        setSelectedCompany(companyToSelect);
      } else {
        setSelectedCompany(companiesData[0] || null);
      }
      setLoading(false);
    }
    fetchAndSetCompanies();
  }, []);

  const handleSetSelectedCompany = (company: Company | null) => {
    setSelectedCompany(company);
    if (company) {
      localStorage.setItem('selectedCompanyId', company.id);
    } else {
      localStorage.removeItem('selectedCompanyId');
    }
  };

  if (loading) {
    return (
       <div className="flex h-screen w-screen items-center justify-center">
         <div className="flex flex-col items-center gap-4">
          <Skeleton className="h-12 w-12 rounded-full" />
          <Skeleton className="h-6 w-48" />
        </div>
      </div>
    )
  }

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
