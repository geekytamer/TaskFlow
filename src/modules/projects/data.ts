import type { Task, Project } from './types';

const today = new Date();

export const placeholderProjects: Project[] = [
  { id: 'proj-1', name: 'Website Redesign', color: '#4A90E2', companyId: '1', visibility: 'Public'},
  { id: 'proj-2', name: 'Q3 Marketing', color: '#F5A623', companyId: '1', visibility: 'Public'},
  { id: 'proj-3', name: 'Mobile App Launch', color: '#7ED321', companyId: '1', visibility: 'Private' },
  { id: 'proj-4', name: 'Synergy Platform', color: '#B452E5', companyId: '2', visibility: 'Public' },
]

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
    projectId: 'proj-1',
    color: '#82B3E8'
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
    projectId: 'proj-2',
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
    projectId: 'proj-2',
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
    projectId: 'proj-1',
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
    projectId: 'proj-2',
    color: '#F8C77A'
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
    projectId: 'proj-4'
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
    projectId: 'proj-4'
  },
  {
    id: 'task-8',
    title: 'Finalize app store screenshots',
    description: 'Create compelling screenshots for the App Store and Google Play listings.',
    status: 'To Do',
    priority: 'High',
    dueDate: new Date(today.setDate(today.getDate() + 7)),
    assignedUserId: '1', // Alice (admin) can see this private project task
    tags: ['Marketing', 'Mobile'],
    companyId: '1',
    projectId: 'proj-3',
    color: '#AEE877'
  },
   {
    id: 'task-9',
    title: 'Beta testing invitations',
    description: 'Send out invitations to our list of beta testers.',
    status: 'In Progress',
    priority: 'Medium',
    dueDate: new Date(today.setDate(today.getDate() + 2)),
    assignedUserId: '1', // Alice (admin) can see this private project task
    tags: ['Testing', 'Mobile'],
    companyId: '1',
    projectId: 'proj-3',
  },
];
