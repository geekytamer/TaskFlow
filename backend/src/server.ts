import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { DataStore } from './data/store';
import { InvoiceStatus, SanitizedUser } from './types';
import { sendWelcomeEmail } from './email';

const store = new DataStore();

const app = express();
app.use(
  cors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
    credentials: true,
  }),
);
app.use(express.json());

type AuthedRequest = Request & { user?: SanitizedUser };

const authMiddleware = (req: AuthedRequest, res: Response, next: NextFunction) => {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ message: 'Unauthorized' });
  const token = header.replace('Bearer ', '').trim();
  const user = store.getUserByToken(token);
  if (!user) return res.status(401).json({ message: 'Unauthorized' });
  req.user = user;
  next();
};

// Auth
app.post('/auth/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required.' });
  }
  const user = store.findUserByEmail(email);
  if (!user || user.password !== password) {
    return res.status(401).json({ message: 'Invalid credentials.' });
  }
  const token = store.issueToken(user.id);
  res.json({ token, user: store.sanitizeUser(user) });
});

app.post('/auth/logout', (req, res) => {
  const header = req.headers.authorization;
  if (header) {
    const token = header.replace('Bearer ', '').trim();
    store.revokeToken(token);
  }
  res.json({ success: true });
});

app.get('/auth/me', authMiddleware, (req: AuthedRequest, res) => {
  res.json({ user: req.user });
});

// Companies
app.get('/companies', (_req, res) => {
  res.json(store.listCompanies());
});

app.get('/companies/:id', (req, res) => {
  const company = store.getCompanyById(req.params.id);
  if (!company) return res.status(404).json({ message: 'Company not found.' });
  res.json(company);
});

app.post('/companies', (req, res) => {
  const company = store.createCompany(req.body);
  res.status(201).json(company);
});

app.delete('/companies/:id', (req, res) => {
  store.deleteCompany(req.params.id);
  res.json({ success: true });
});

// Positions
app.get('/positions', (_req, res) => {
  res.json(store.listPositions());
});

app.get('/positions/:id', (req, res) => {
  const position = store.getPositionById(req.params.id);
  if (!position) return res.status(404).json({ message: 'Position not found.' });
  res.json(position);
});

app.post('/positions', (req, res) => {
  const position = store.createPosition(req.body);
  res.status(201).json(position);
});

app.delete('/positions/:id', (req, res) => {
  store.deletePosition(req.params.id);
  res.json({ success: true });
});

// Users
app.get('/users', (_req, res) => {
  res.json(store.listUsers());
});

app.get('/users/:id', (req, res) => {
  const user = store.getUserById(req.params.id);
  if (!user) return res.status(404).json({ message: 'User not found.' });
  res.json(user);
});

app.get('/companies/:companyId/users', (req, res) => {
  const users = store.getUsersByCompany(req.params.companyId);
  res.json(users);
});

app.post('/users', (req, res) => {
  try {
    if (!req.body?.password) {
      return res.status(400).json({ message: 'Password is required.' });
    }
    const user = store.createUser(req.body);
    sendWelcomeEmail({
      to: user.email,
      name: user.name,
      password: req.body.password,
    }).catch((err) => console.error('Failed to send welcome email', err));
    res.status(201).json({ user });
  } catch (error: any) {
    res.status(400).json({ message: error?.message || 'Unable to create user.' });
  }
});

app.put('/users/:id', (req, res) => {
  const user = store.updateUser(req.params.id, req.body);
  if (!user) return res.status(404).json({ message: 'User not found.' });
  res.json(user);
});

app.delete('/users/:id', (req, res) => {
  store.deleteUser(req.params.id);
  res.json({ success: true });
});

// Projects
app.get('/projects', (_req, res) => {
  res.json(store.listProjects());
});

app.get('/projects/:id', (req, res) => {
  const project = store.getProjectById(req.params.id);
  if (!project) return res.status(404).json({ message: 'Project not found.' });
  res.json(project);
});

app.post('/projects', (req, res) => {
  const project = store.createProject(req.body);
  res.status(201).json(project);
});

app.put('/projects/:id', (req, res) => {
  const project = store.updateProject(req.params.id, req.body);
  if (!project) return res.status(404).json({ message: 'Project not found.' });
  res.json(project);
});

app.delete('/projects/:id', (req, res) => {
  const existing = store.getProjectById(req.params.id);
  if (!existing) return res.status(404).json({ message: 'Project not found.' });
  store.deleteProject(req.params.id);
  res.json({ success: true });
});

app.post('/projects/:id/members', (req, res) => {
  const { userId } = req.body || {};
  if (!userId) return res.status(400).json({ message: 'userId is required.' });
  const project = store.addProjectMember(req.params.id, userId);
  if (!project) return res.status(404).json({ message: 'Project not found.' });
  res.json(project);
});

app.delete('/projects/:id/members/:userId', (req, res) => {
  const project = store.removeProjectMember(req.params.id, req.params.userId);
  if (!project) return res.status(404).json({ message: 'Project not found.' });
  res.json(project);
});

// Tasks
app.get('/tasks', (_req, res) => {
  res.json(store.listTasks());
});

app.get('/tasks/:id', (req, res) => {
  const task = store.getTaskById(req.params.id);
  if (!task) return res.status(404).json({ message: 'Task not found.' });
  res.json(task);
});

app.get('/companies/:companyId/clients/:clientId/tasks', (req, res) => {
  const tasks = store.getTasksByClient(req.params.companyId, req.params.clientId);
  res.json(tasks);
});

app.post('/tasks', (req, res) => {
  const task = store.createTask(req.body);
  res.status(201).json(task);
});

app.put('/tasks/:id', (req, res) => {
  const task = store.updateTask(req.params.id, req.body);
  if (!task) return res.status(404).json({ message: 'Task not found.' });
  res.json(task);
});

app.post('/tasks/mark-invoiced', (req, res) => {
  const { taskIds, invoiceId } = req.body || {};
  if (!Array.isArray(taskIds) || !invoiceId) {
    return res.status(400).json({ message: 'taskIds and invoiceId are required.' });
  }
  store.markTasksAsInvoiced(taskIds, invoiceId);
  res.json({ success: true });
});

// Comments
app.get('/tasks/:taskId/comments', (req, res) => {
  const comments = store.listCommentsByTask(req.params.taskId);
  res.json(comments);
});

app.post('/tasks/:taskId/comments', (req, res) => {
  const comment = store.createComment({ ...req.body, taskId: req.params.taskId });
  res.status(201).json(comment);
});

// Clients
app.get('/companies/:companyId/clients', (req, res) => {
  const clients = store.listClients(req.params.companyId);
  res.json(clients);
});

app.post('/clients', (req, res) => {
  const client = store.createClient(req.body);
  res.status(201).json(client);
});

// Invoices
app.get('/companies/:companyId/invoices', (req, res) => {
  const invoices = store.listInvoices(req.params.companyId);
  res.json(invoices);
});

app.post('/invoices', (req, res) => {
  const invoice = store.createInvoice(req.body);
  res.status(201).json(invoice);
});

app.patch('/invoices/:id/status', (req, res) => {
  const { status } = req.body || {};
  if (!status) return res.status(400).json({ message: 'Status is required.' });
  const updated = store.updateInvoiceStatus(req.params.id, status as InvoiceStatus);
  if (!updated) return res.status(404).json({ message: 'Invoice not found.' });
  res.json(updated);
});

app.put('/invoices/:id', (req, res) => {
  const updated = store.updateInvoice(req.params.id, req.body);
  if (!updated) return res.status(404).json({ message: 'Invoice not found.' });
  res.json(updated);
});

app.get('/invoices/:id/payments', (req, res) => {
  const payments = store.listPayments(req.params.id);
  res.json(payments);
});

app.post('/invoices/:id/payments', (req, res) => {
  const { amount, method, note, paidAt } = req.body || {};
  if (amount === undefined || amount === null) {
    return res.status(400).json({ message: 'amount is required.' });
  }
  const payment = store.createPayment({
    invoiceId: req.params.id,
    amount: Number(amount),
    method,
    note,
    paidAt,
  });
  res.status(201).json(payment);
});

// Seed / reset
app.post('/seed', (_req, res) => {
  store.reset();
  res.json({ success: true });
});

export function createServer() {
  return app;
}

export function getStore() {
  return store;
}
