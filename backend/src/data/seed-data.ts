import {
  Company,
  Position,
  User,
  Project,
  Task,
  Comment,
  Client,
  Invoice,
} from '../types';

interface SeedData {
  companies: Company[];
  positions: Position[];
  users: User[];
  projects: Project[];
  tasks: Task[];
  comments: Comment[];
  clients: Client[];
  invoices: Invoice[];
}

const companies: Company[] = [
  { id: '1', name: 'Innovate Corp', website: 'innovatecorp.com', address: '123 Tech Ave, Silicon Valley' },
  { id: '2', name: 'Synergy Solutions', website: 'synergysolutions.com', address: '456 Business Blvd, New York' },
  { id: '3', name: 'QuantumLeap Inc.', website: 'quantumleap.com', address: '789 Future Way, Boston' },
];

const positions: Position[] = [
  { id: 'pos-1', title: 'Software Engineer', companyId: '1' },
  { id: 'pos-2', title: 'Product Manager', companyId: '1' },
  { id: 'pos-3', title: 'UX Designer', companyId: '1' },
  { id: 'pos-4', title: 'Marketing Specialist', companyId: '2' },
  { id: 'pos-5', title: 'Data Analyst', companyId: '2' },
  { id: 'pos-6', title: 'AI Researcher', companyId: '3' },
];

const users: User[] = [
  {
    id: 'admin-placeholder-id',
    name: 'Admin User',
    email: 'admin@taskflow.com',
    role: 'Admin',
    companyIds: ['1', '2', '3'],
    positionId: 'pos-2',
    avatar: 'https://i.pravatar.cc/150?u=admin',
    password: 'password',
  },
  {
    id: 'user-2',
    name: 'Samantha Bee',
    email: 'samantha.b@innovatecorp.com',
    role: 'Manager',
    companyIds: ['1'],
    positionId: 'pos-1',
    avatar: 'https://i.pravatar.cc/150?u=user-2',
    password: 'password',
  },
  {
    id: 'user-3',
    name: 'Charlie Davis',
    email: 'charlie.d@innovatecorp.com',
    role: 'Employee',
    companyIds: ['1'],
    positionId: 'pos-3',
    avatar: 'https://i.pravatar.cc/150?u=user-3',
    password: 'password',
  },
  {
    id: 'user-4',
    name: 'Dana Scully',
    email: 'dana.s@synergysolutions.com',
    role: 'Manager',
    companyIds: ['2'],
    positionId: 'pos-4',
    avatar: 'https://i.pravatar.cc/150?u=user-4',
    password: 'password',
  },
  {
    id: 'user-5',
    name: 'Fox Mulder',
    email: 'fox.m@synergysolutions.com',
    role: 'Employee',
    companyIds: ['1', '2'],
    positionId: 'pos-5',
    avatar: 'https://i.pravatar.cc/150?u=user-5',
    password: 'password',
  },
];

const clients: Client[] = [
  { id: 'client-1', name: 'Acme Corp', email: 'billing@acme.com', address: '12 Market St, SF', companyId: '1' },
  { id: 'client-2', name: 'Globex', email: 'ap@globex.com', address: '500 Park Ave, NY', companyId: '2' },
];

const projects: Project[] = [
  {
    id: 'proj-1',
    name: 'Q3 Marketing Blitz',
    description: 'A comprehensive marketing campaign for the third quarter.',
    color: '#F5A623',
    companyId: '1',
    visibility: 'Public',
    memberIds: ['admin-placeholder-id', 'user-2'],
    clientId: 'client-1',
  },
  {
    id: 'proj-2',
    name: 'New App Development',
    description: 'Building the next-gen mobile application from scratch.',
    color: '#4A90E2',
    companyId: '1',
    visibility: 'Private',
    memberIds: ['admin-placeholder-id', 'user-3'],
    clientId: 'client-1',
  },
  {
    id: 'proj-3',
    name: 'Website Redesign',
    description: 'Complete overhaul of the main company website.',
    color: '#7ED321',
    companyId: '2',
    visibility: 'Public',
    memberIds: ['user-4', 'user-5'],
    clientId: 'client-2',
  },
];

const tasks: Task[] = [
  {
    id: 'task-1',
    title: 'Draft campaign brief',
    description: 'Create the initial brief for the Q3 marketing campaign, outlining goals, target audience, and budget.',
    status: 'Done',
    priority: 'High',
    createdAt: new Date('2024-07-01'),
    dueDate: new Date('2024-07-15'),
    assignedUserIds: ['admin-placeholder-id'],
    tags: ['planning', 'writing'],
    companyId: '1',
    projectId: 'proj-1',
    invoiceVendor: 'Figma',
    invoiceNumber: 'FG-1001',
    invoiceAmount: 1200,
    invoiceDate: new Date('2024-07-15'),
  },
  {
    id: 'task-2',
    title: 'Design social media assets',
    description: 'Create visuals for all social media platforms.',
    status: 'In Progress',
    priority: 'Medium',
    createdAt: new Date('2024-07-16'),
    dueDate: new Date('2024-07-20'),
    assignedUserIds: ['user-2'],
    tags: ['design', 'social media'],
    companyId: '1',
    projectId: 'proj-1',
    dependencies: ['task-1'],
  },
  {
    id: 'task-3',
    title: 'Develop landing page',
    description: 'Build and deploy the landing page for the campaign.',
    status: 'To Do',
    priority: 'High',
    createdAt: new Date('2024-07-18'),
    dueDate: new Date('2024-07-25'),
    assignedUserIds: ['user-3'],
    tags: ['development', 'web'],
    companyId: '1',
    projectId: 'proj-1',
    dependencies: ['task-1'],
  },
  {
    id: 'task-4',
    title: 'User authentication flow',
    description: 'Implement login, signup, and password reset functionality.',
    status: 'In Progress',
    priority: 'High',
    createdAt: new Date('2024-07-20'),
    dueDate: new Date('2024-08-01'),
    assignedUserIds: ['user-3'],
    tags: ['feature', 'backend'],
    companyId: '1',
    projectId: 'proj-2',
  },
  {
    id: 'task-5',
    title: 'Create component library',
    description: 'Develop a reusable component library for the new app.',
    status: 'To Do',
    priority: 'Medium',
    createdAt: new Date('2024-07-25'),
    dueDate: new Date('2024-08-10'),
    assignedUserIds: ['user-3'],
    tags: ['design system', 'frontend'],
    companyId: '1',
    projectId: 'proj-2',
  },
  {
    id: 'task-6',
    title: 'Conduct user research',
    description: 'Interview target users to gather feedback on the current website.',
    status: 'Done',
    priority: 'Medium',
    createdAt: new Date('2024-07-05'),
    dueDate: new Date('2024-07-12'),
    assignedUserIds: ['user-4'],
    tags: ['research', 'ux'],
    companyId: '2',
    projectId: 'proj-3',
    invoiceVendor: 'Research Labs',
    invoiceNumber: 'RL-2044',
    invoiceAmount: 850,
    invoiceDate: new Date('2024-07-12'),
  },
  {
    id: 'task-7',
    title: 'Create wireframes',
    description: 'Develop low-fidelity wireframes for the new website layout.',
    status: 'To Do',
    priority: 'High',
    createdAt: new Date('2024-07-14'),
    dueDate: new Date('2024-07-22'),
    assignedUserIds: ['user-5'],
    tags: ['design', 'planning'],
    companyId: '2',
    projectId: 'proj-3',
    dependencies: ['task-6'],
  },
];

const comments: Comment[] = [];
const invoices: Invoice[] = [];

export const seedData: SeedData = {
  companies,
  positions,
  users,
  projects,
  tasks,
  comments,
  clients,
  invoices,
};
