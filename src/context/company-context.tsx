'use client';

import * as React from 'react';
import type { Company } from '@/modules/companies/types';
import type { Project } from '@/modules/projects/types';
import { getCompanies } from '@/services/companyService';
import { getProjects } from '@/services/projectService';
import { Skeleton } from '@/components/ui/skeleton';

interface CompanyContextType {
  selectedCompany: Company | null;
  setSelectedCompany: (company: Company | null) => void;
  companies: Company[];
  projects: Project[];
  refreshCompanies: () => void;
  refreshProjects: () => void;
}

const CompanyContext = React.createContext<CompanyContextType | undefined>(undefined);

export function CompanyProvider({ children }: { children: React.ReactNode }) {
  const [companies, setCompanies] = React.useState<Company[]>([]);
  const [projects, setProjects] = React.useState<Project[]>([]);
  const [selectedCompany, setSelectedCompany] = React.useState<Company | null>(null);
  const [loading, setLoading] = React.useState(true);

  const fetchCompanies = React.useCallback(async () => {
    setLoading(true);
    try {
      const companiesData = await getCompanies();
      setCompanies(companiesData);

      if (companiesData.length > 0) {
        const storedCompanyId = localStorage.getItem('selectedCompanyId');
        const companyToSelect = companiesData.find(c => c.id === storedCompanyId) || companiesData[0];
        
        if (!selectedCompany || selectedCompany.id !== companyToSelect.id) {
          setSelectedCompany(companyToSelect);
        }
      } else {
        setSelectedCompany(null);
      }
    } catch (error) {
      console.error("Failed to fetch companies:", error);
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchProjects = React.useCallback(async () => {
    try {
      const projectData = await getProjects();
      setProjects(projectData);
    } catch (error) {
      console.error("Failed to fetch projects:", error);
    }
  }, []);

  React.useEffect(() => {
    fetchCompanies();
    fetchProjects();
  }, [fetchCompanies, fetchProjects]);

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
    companies,
    projects,
    refreshCompanies: fetchCompanies,
    refreshProjects: fetchProjects,
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
