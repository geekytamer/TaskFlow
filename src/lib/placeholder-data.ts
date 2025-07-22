import type { Company, User, Task } from './types';

export const placeholderCompanies: Company[] = [
  { id: '1', name: 'Innovate Corp' },
  { id: '2', name: 'Synergy Solutions' },
  { id: '3', name: 'Quantum Holdings' },
];

export const placeholderUsers: User[] = [
  { id: '1', name: 'Alice Admin', email: 'alice@innovate.com', role: 'Admin', companyId: '1', avatar: 'https://i.pravatar.cc/150?u=1' },
  { id: '2', name: 'Bob Manager', email: 'bob@innovate.com', role: 'Manager', companyId: '1', avatar: 'https://i.pravatar.cc/150?u=2' },
  { id: '3', name: 'Charlie Employee', email: 'charlie@innovate.com', role: 'Employee', companyId: '1', avatar: 'https://i.pravatar.cc/150?u=3' },
  { id: '4', name: 'Diana Manager', email: 'diana@synergy.com', role: 'Manager', companyId: '2', avatar: 'https://i.pravatar.cc/150?u=4' },
  { id: '5', name: 'Ethan Employee', email: 'ethan@synergy.com', role: 'Employee', companyId: '2', avatar: 'https://i.pravatar.cc/150?u=5' },
];

const today = new Date();
export const placeholderTasks: Task[] = [
  {
    id: 'task-1',
    title: 'Develop new homepage design',
    description: 'Create a modern, responsive design for the main company website.',
    status: 'In Progress',
    priority: 'High',
    dueDate: new Date(today.setDate(today.getDate() + 5)),
    assignedUserId: '2',
    tags: ['UI/UX', 'Website'],
    companyId: '1',
  },
  {
    id: 'task-2',
    title: 'Quarterly financial report',
    description: 'Compile and finalize the Q2 financial report for the board meeting.',
    status: 'To Do',
    priority: 'High',
    dueDate: new Date(today.setDate(today.getDate() + 10)),
    assignedUserId: '1',
    tags: ['Finance', 'Reporting'],
    companyId: '1',
  },
  {
    id: 'task-3',
    title: 'Update client CRM',
    description: 'Update all client contact information and recent interactions in the CRM.',
    status: 'To Do',
    priority: 'Medium',
    assignedUserId: '3',
    tags: ['CRM', 'Client Data'],
    companyId: '1',
  },
  {
    id: 'task-4',
    title: 'Fix login page bug',
    description: 'Users are reporting issues with password resets on the login page.',
    status: 'Done',
    priority: 'High',
    dueDate: new Date(today.setDate(today.getDate() - 2)),
    assignedUserId: '2',
    tags: ['Bug', 'Auth'],
    companyId: '1',
  },
  {
    id: 'task-5',
    title: 'Onboard new marketing intern',
    description: 'Prepare onboarding materials and schedule introductory meetings.',
    status: 'In Progress',
    priority: 'Medium',
    dueDate: new Date(today.setDate(today.getDate() + 3)),
    tags: ['HR', 'Onboarding'],
    companyId: '1',
  },
  {
    id: 'task-6',
    title: 'Plan summer marketing campaign',
    description: 'Outline the strategy, budget, and KPIs for the summer campaign.',
    status: 'To Do',
    priority: 'High',
    assignedUserId: '4',
    tags: ['Marketing', 'Strategy'],
    companyId: '2',
  },
  {
    id: 'task-7',
    title: 'Client proposal for Project X',
    description: 'Draft and send the project proposal to the new client.',
    status: 'Done',
    priority: 'Medium',
    dueDate: new Date(today.setDate(today.getDate() - 5)),
    assignedUserId: '5',
    tags: ['Sales', 'Proposal'],
    companyId: '2',
  },
];
