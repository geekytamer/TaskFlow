import type { Task, Project, Comment } from './types';

const today = new Date();

export const placeholderProjects: Project[] = [
  { id: 'proj-1', name: 'Website Redesign', color: '#4A90E2', companyId: '1', visibility: 'Public'},
  { id: 'proj-2', name: 'Q3 Marketing', color: '#F5A623', companyId: '1', visibility: 'Public'},
  { id: 'proj-3', name: 'Mobile App Launch', color: '#7ED321', companyId: '1', visibility: 'Private', memberIds: ['1'] },
  { id: 'proj-4', name: 'Synergy Platform', color: '#B452E5', companyId: '2', visibility: 'Public' },
]

export const placeholderTasks: Task[] = [
  {
    id: 'task-1',
    title: 'Develop new homepage design',
    description: 'Create a modern, responsive design for the main company website. The new design should incorporate the new branding guidelines and be optimized for mobile devices. Key sections to include are a hero banner, features overview, customer testimonials, and a clear call-to-action.',
    status: 'In Progress',
    priority: 'High',
    dueDate: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 5),
    assignedUserIds: ['2'],
    tags: ['UI/UX', 'Website'],
    companyId: '1',
    projectId: 'proj-1',
    color: '#82B3E8',
    dependencies: ['task-4']
  },
  {
    id: 'task-2',
    title: 'Quarterly financial report',
    description: 'Compile and finalize the Q2 financial report for the board meeting. This includes gathering data from all departments, creating visualizations, and writing the executive summary.',
    status: 'To Do',
    priority: 'High',
    dueDate: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 10),
    assignedUserIds: ['1'],
    tags: ['Finance', 'Reporting'],
    companyId: '1',
    projectId: 'proj-2',
  },
  {
    id: 'task-3',
    title: 'Update client CRM',
    description: 'Update all client contact information and recent interactions in the CRM. Ensure all data is accurate and complete for the sales team.',
    status: 'To Do',
    priority: 'Medium',
    assignedUserIds: ['3'],
    dueDate: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 8),
    tags: ['CRM', 'Client Data'],
    companyId: '1',
    projectId: 'proj-2',
  },
  {
    id: 'task-4',
    title: 'Fix login page bug',
    description: 'Users are reporting issues with password resets on the login page. The error seems to occur when the user enters an email address that is not in the system. The expected behavior is a user-friendly error message.',
    status: 'Done',
    priority: 'High',
    dueDate: new Date(today.getFullYear(), today.getMonth(), today.getDate() - 2),
    assignedUserIds: ['2'],
    tags: ['Bug', 'Auth'],
    companyId: '1',
    projectId: 'proj-1',
  },
  {
    id: 'task-5',
    title: 'Onboard new marketing intern',
    description: 'Prepare onboarding materials and schedule introductory meetings. The onboarding plan should cover company policies, marketing tools, and an overview of current campaigns.',
    status: 'In Progress',
    priority: 'Medium',
    dueDate: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 3),
    tags: ['HR', 'Onboarding'],
    companyId: '1',
    projectId: 'proj-2',
    color: '#F8C77A',
    assignedUserIds: ['1', '3'],
  },
  {
    id: 'task-6',
    title: 'Plan summer marketing campaign',
    description: 'Outline the strategy, budget, and KPIs for the summer campaign. The campaign will focus on promoting our new product line through social media and influencer partnerships.',
    status: 'To Do',
    priority: 'High',
    dueDate: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 15),
    assignedUserIds: ['4'],
    tags: ['Marketing', 'Strategy'],
    companyId: '2',
    projectId: 'proj-4'
  },
  {
    id: 'task-7',
    title: 'Client proposal for Project X',
    description: 'Draft and send the project proposal to the new client. The proposal should detail the project scope, timeline, deliverables, and cost.',
    status: 'Done',
    priority: 'Medium',
    dueDate: new Date(today.getFullYear(), today.getMonth(), today.getDate() - 5),
    assignedUserIds: ['5'],
    tags: ['Sales', 'Proposal'],
    companyId: '2',
    projectId: 'proj-4'
  },
  {
    id: 'task-8',
    title: 'Finalize app store screenshots',
    description: 'Create compelling screenshots for the App Store and Google Play listings. The screenshots should highlight the key features and user interface of the app.',
    status: 'To Do',
    priority: 'High',
    dueDate: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 7),
    assignedUserIds: ['1'], // Alice (admin) can see this private project task
    tags: ['Marketing', 'Mobile'],
    companyId: '1',
    projectId: 'proj-3',
    color: '#AEE877'
  },
   {
    id: 'task-9',
    title: 'Beta testing invitations',
    description: 'Send out invitations to our list of beta testers. The email should include a link to download the beta version and instructions on how to provide feedback.',
    status: 'In Progress',
    priority: 'Medium',
    dueDate: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 2),
    assignedUserIds: ['1'], // Alice (admin) can see this private project task
    tags: ['Testing', 'Mobile'],
    companyId: '1',
    projectId: 'proj-3',
    dependencies: ['task-8']
  },
];

export const placeholderComments: Comment[] = [
    {
        id: 'comment-1',
        taskId: 'task-1',
        userId: '1',
        content: 'I\'ve started working on the wireframes. I\'ll have a draft ready for review by EOD tomorrow.',
        createdAt: new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1, 10, 30),
    },
    {
        id: 'comment-2',
        taskId: 'task-1',
        userId: '2',
        content: 'Sounds good! Looking forward to seeing them. Let me know if you need the new branding assets.',
        createdAt: new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1, 11, 15),
    },
     {
        id: 'comment-3',
        taskId: 'task-4',
        userId: '2',
        content: 'This bug has been resolved and deployed to production.',
        createdAt: new Date(today.getFullYear(), today.getMonth(), today.getDate() - 2, 16, 0),
    },
];
