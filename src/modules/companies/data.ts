import type { Company, Position } from './types';

export const placeholderCompanies: Company[] = [
  { id: '1', name: 'Innovate Corp', website: 'innovatecorp.com', address: '123 Tech Lane, Silicon Valley' },
  { id: '2', name: 'Synergy Solutions', website: 'synergysolutions.com', address: '456 Business Blvd, Metropolis' },
  { id: '3', name: 'Quantum Holdings', website: 'quantum.dev', address: '789 Future Way, Genesis City' },
];

export const placeholderPositions: Position[] = [
    { id: 'pos-1', title: 'Software Engineer', companyId: '1' },
    { id: 'pos-2', title: 'Product Manager', companyId: '1' },
    { id: 'pos-3', title: 'UX Designer', companyId: '1' },
    { id: 'pos-4', title: 'Marketing Lead', companyId: '2' },
    { id: 'pos-5', title: 'Sales Associate', companyId: '2' },
    { id: 'pos-6', title: 'CEO', companyId: '3' },
]
