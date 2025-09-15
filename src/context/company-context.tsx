'use client';

import * as React from 'react';
import type { Company } from '@/modules/companies/types';
import type { Project } from '@/modules/projects/types';
import type { User } from '@/modules/users/types';
import { getCompanies } from '@/services/companyService';
import { getProjects } from '@/services/projectService';
import { Skeleton } from '@/components/ui/skeleton';
import { useCurrentUser } from '@/hooks/use-current-user';

interface CompanyContextType {
  selectedCompany: Company | null;
  setSelectedCompany: (company: Company | null) => void;
  companies: Company[];
  projects: Project[];
  currentUser: User | null;
  refreshCompanies: () => void;
  refreshProjects: () => void;
  loading: boolean;
}

const CompanyContext = React.createContext<CompanyContextType | undefined>(undefined);

export function CompanyProvider({ children }: { children: React.ReactNode }) {
  const { user: currentUser, loading: userLoading } = useCurrentUser();
  const [companies, setCompanies] = React.useState<Company[]>([]);
  const [projects, setProjects] = React.useState<Project[]>([]);
  const [selectedCompany, setSelectedCompany] = React.useState<Company | null>(null);
  const [loading, setLoading] = React.useState(true);

  const fetchCompanies = React.useCallback(async () => {
    if (!currentUser) return [];
    try {
      const allCompanies = await getCompanies();
      if (currentUser.role === 'Admin') {
        setCompanies(allCompanies);
        return allCompanies;
      } else {
        const accessibleCompanies = allCompanies.filter(c => currentUser.companyIds.includes(c.id));
        setCompanies(accessibleCompanies);
        return accessibleCompanies;
      }
    } catch (error) {
      console.error("Failed to fetch companies:", error);
      setCompanies([]);
      return [];
    }
  }, [currentUser]);

  const fetchProjects = React.useCallback(async () => {
    try {
      const projectData = await getProjects();
      setProjects(projectData);
    } catch (error) {
      console.error("Failed to fetch projects:", error);
    }
  }, []);
  
  const initialize = React.useCallback(async () => {
    setLoading(true);
    const accessibleCompanies = await fetchCompanies();
    await fetchProjects();

    if (accessibleCompanies.length > 0) {
      const storedCompanyId = localStorage.getItem('selectedCompanyId');
      // Ensure the stored company is one the user can actually access
      const companyToSelect = accessibleCompanies.find(c => c.id === storedCompanyId) || accessibleCompanies[0];
      
      if (!selectedCompany || selectedCompany.id !== companyToSelect.id) {
        setSelectedCompany(companyToSelect);
        localStorage.setItem('selectedCompanyId', companyToSelect.id);
      }
    } else {
      setSelectedCompany(null);
    }
    setLoading(false);
  }, [fetchCompanies, fetchProjects, selectedCompany]);


  React.useEffect(() => {
    if (!userLoading && currentUser) {
      initialize();
    }
    if (!userLoading && !currentUser) {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser, userLoading]);


  const handleSetSelectedCompany = (company: Company | null) => {
    setSelectedCompany(company);
    if (company) {
      localStorage.setItem('selectedCompanyId', company.id);
    } else {
      localStorage.removeItem('selectedCompanyId');
    }
  };

  const isLoading = userLoading || loading;

  const value = {
    selectedCompany,
    setSelectedCompany: handleSetSelectedCompany,
    companies,
    projects,
    currentUser,
    refreshCompanies: fetchCompanies,
    refreshProjects: fetchProjects,
    loading: isLoading,
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
