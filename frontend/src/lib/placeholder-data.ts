import type { Company, Position } from '@/modules/companies/types';
import type { User } from '@/modules/users/types';
import type { Project, Task } from '@/modules/projects/types';

export const placeholderCompanies: Company[] = [
  { id: '1', name: 'Innovate Corp', website: 'innovatecorp.com', address: '123 Tech Ave, Silicon Valley' },
  { id: '2', name: 'Synergy Solutions', website: 'synergysolutions.com', address: '456 Business Blvd, New York' },
  { id: '3', name: 'QuantumLeap Inc.', website: 'quantumleap.com', address: '789 Future Way, Boston' },
];

export const placeholderPositions: Position[] = [
    { id: 'pos-1', title: 'Software Engineer', companyId: '1' },
    { id: 'pos-2', title: 'Product Manager', companyId: '1' },
    { id: 'pos-3', title: 'UX Designer', companyId: '1' },
    { id: 'pos-4', title: 'Marketing Specialist', companyId: '2' },
    { id: 'pos-5', title: 'Data Analyst', companyId: '2' },
    { id: 'pos-6', title: 'AI Researcher', companyId: '3' },
];

export const placeholderUsers: User[] = [
  {
    id: 'admin-placeholder-id', // This ID is special for the admin user
    name: 'Alex Johnson',
    email: 'alex.j@innovatecorp.com', // This email will be replaced by admin@taskflow.com during seeding
    role: 'Admin',
    companyIds: ['1', '2', '3'], // Admins have access to all companies
    positionId: 'pos-2',
    avatar: 'https://i.pravatar.cc/150?u=user-1',
  },
  {
    id: 'user-2',
    name: 'Samantha Bee',
    email: 'samantha.b@innovatecorp.com',
    role: 'Manager',
    companyIds: ['1'],
    positionId: 'pos-1',
    avatar: 'https://i.pravatar.cc/150?u=user-2',
  },
  {
    id: 'user-3',
    name: 'Charlie Davis',
    email: 'charlie.d@innovatecorp.com',
    role: 'Employee',
    companyIds: ['1'],
    positionId: 'pos-3',
    avatar: 'https://i.pravatar.cc/150?u=user-3',
  },
  {
    id: 'user-4',
    name: 'Dana Scully',
    email: 'dana.s@synergysolutions.com',
    role: 'Manager',
    companyIds: ['2'],
    positionId: 'pos-4',
    avatar: 'https://i.pravatar.cc/150?u=user-4',
  },
  {
    id: 'user-5',
    name: 'Fox Mulder',
    email: 'fox.m@synergysolutions.com',
    role: 'Employee',
    companyIds: ['1', '2'], // This user has access to two companies
    positionId: 'pos-5',
    avatar: 'https://i.pravatar.cc/150?u=user-5',
  },
];

export const placeholderProjects: Project[] = [
  { 
    id: 'proj-1', 
    name: 'Q3 Marketing Blitz', 
    description: 'A comprehensive marketing campaign for the third quarter.',
    color: '#F5A623', 
    companyId: '1',
    visibility: 'Public',
    memberIds: ['user-1', 'user-2']
  },
  { 
    id: 'proj-2', 
    name: 'New App Development', 
    description: 'Building the next-gen mobile application from scratch.',
    color: '#4A90E2', 
    companyId: '1',
    visibility: 'Private',
    memberIds: ['user-1', 'user-3']
  },
  { 
    id: 'proj-3', 
    name: 'Website Redesign', 
    description: 'Complete overhaul of the main company website.',
    color: '#7ED321', 
    companyId: '2',
    visibility: 'Public',
    memberIds: ['user-4', 'user-5']
  },
];


export const placeholderTasks: Omit<Task, 'createdAt' | 'dueDate'> & { createdAt: string, dueDate?: string }[] = [
  // Tasks for Project 1
  {
    id: 'task-1',
    title: 'Draft campaign brief',
    description: 'Create the initial brief for the Q3 marketing campaign, outlining goals, target audience, and budget.',
    status: 'Done',
    priority: 'High',
    createdAt: '2024-07-01',
    dueDate: '2024-07-15',
    assignedUserIds: ['admin-placeholder-id'],
    tags: ['planning', 'writing'],
    companyId: '1',
    projectId: 'proj-1'
  },
  {
    id: 'task-2',
    title: 'Design social media assets',
    description: 'Create visuals for all social media platforms.',
    status: 'In Progress',
    priority: 'Medium',
    createdAt: '2024-07-16',
    dueDate: '2024-07-20',
    assignedUserIds: ['user-2'],
    tags: ['design', 'social media'],
    companyId: '1',
    projectId: 'proj-1',
    dependencies: ['task-1']
  },
  {
    id: 'task-3',
    title: 'Develop landing page',
    description: 'Build and deploy the landing page for the campaign.',
    status: 'To Do',
    priority: 'High',
    createdAt: '2024-07-18',
    dueDate: '2024-07-25',
    assignedUserIds: ['user-3'],
    tags: ['development', 'web'],
    companyId: '1',
    projectId: 'proj-1',
    dependencies: ['task-1']
  },
  // Tasks for Project 2
  {
    id: 'task-4',
    title: 'User authentication flow',
    description: 'Implement login, signup, and password reset functionality.',
    status: 'In Progress',
    priority: 'High',
    createdAt: '2024-07-20',
    dueDate: '2024-08-01',
    assignedUserIds: ['user-3'],
    tags: ['feature', 'backend'],
    companyId: '1',
    projectId: 'proj-2'
  },
  {
    id: 'task-5',
    title: 'Create component library',
    description: 'Develop a reusable component library for the new app.',
    status: 'To Do',
    priority: 'Medium',
    createdAt: '2024-07-25',
    dueDate: '2024-08-10',
    assignedUserIds: ['user-3'],
    tags: ['design system', 'frontend'],
    companyId: '1',
    projectId: 'proj-2'
  },
  // Tasks for Project 3
  {
    id: 'task-6',
    title: 'Conduct user research',
    description: 'Interview target users to gather feedback on the current website.',
    status: 'Done',
    priority: 'Medium',
    createdAt: '2024-07-05',
    dueDate: '2024-07-12',
    assignedUserIds: ['user-4'],
    tags: ['research', 'ux'],
    companyId: '2',
    projectId: 'proj-3'
  },
  {
    id: 'task-7',
    title: 'Create wireframes',
    description: 'Develop low-fidelity wireframes for the new website layout.',
    status: 'To Do',
    priority: 'High',
    createdAt: '2024-07-14',
    dueDate: '2024-07-22',
    assignedUserIds: ['user-5'],
    tags: ['design', 'planning'],
    companyId: '2',
    projectId: 'proj-3',
    dependencies: ['task-6']
  },
];
