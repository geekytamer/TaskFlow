import path from 'path';
import Database from 'better-sqlite3';
import { v4 as uuid } from 'uuid';
import { seedData } from './seed-data';
import {
  Company,
  Position,
  User,
  CompanyRoleAssignment,
  Project,
  Task,
  Comment,
  Client,
  Invoice,
  InvoiceStatus,
  SanitizedUser,
  UserRole,
  Payment,
} from '../types';

type CreateUserInput = Omit<User, 'id'> & { id?: string };
type CreateTaskInput = Omit<Task, 'id' | 'createdAt'> & { createdAt?: Date | string };
type UpdateTaskInput = Partial<Omit<Task, 'id'>>;

const defaultDbPath = path.join(process.cwd(), 'taskflow.db');

export class DataStore {
  private db: Database.Database;

  constructor(dbPath = defaultDbPath) {
    this.db = new Database(dbPath);
    this.ensureTables();
    this.seedIfEmpty();
  }

  private ensureTables() {
    this.db.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS companies (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        website TEXT,
        address TEXT
      );
      CREATE TABLE IF NOT EXISTS positions (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        companyId TEXT
      );
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        role TEXT NOT NULL,
        companyIds TEXT NOT NULL,
        positionId TEXT,
        companyRoles TEXT,
        avatar TEXT,
        password TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        color TEXT,
        companyId TEXT NOT NULL,
        visibility TEXT NOT NULL,
        memberIds TEXT,
        clientId TEXT
      );
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        status TEXT NOT NULL,
        priority TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        dueDate TEXT,
        assignedUserIds TEXT,
        tags TEXT,
        companyId TEXT NOT NULL,
        projectId TEXT NOT NULL,
        color TEXT,
        dependencies TEXT,
        parentTaskId TEXT,
        invoiceImage TEXT,
        invoiceVendor TEXT,
        invoiceNumber TEXT,
        invoiceAmount REAL,
        invoiceDate TEXT,
        generatedInvoiceId TEXT
      );
      CREATE TABLE IF NOT EXISTS comments (
        id TEXT PRIMARY KEY,
        taskId TEXT NOT NULL,
        userId TEXT NOT NULL,
        content TEXT NOT NULL,
        createdAt TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS clients (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        address TEXT NOT NULL,
        companyId TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS invoices (
        id TEXT PRIMARY KEY,
        invoiceNumber TEXT NOT NULL,
        companyId TEXT NOT NULL,
        clientId TEXT NOT NULL,
        issueDate TEXT NOT NULL,
        dueDate TEXT NOT NULL,
        lineItems TEXT NOT NULL,
        total REAL NOT NULL,
        status TEXT NOT NULL,
        notes TEXT,
        currency TEXT,
        taxRate REAL,
        sentAt TEXT,
        paidAt TEXT
      );
      CREATE TABLE IF NOT EXISTS payments (
        id TEXT PRIMARY KEY,
        invoiceId TEXT NOT NULL,
        amount REAL NOT NULL,
        method TEXT,
        note TEXT,
        paidAt TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS tokens (
        token TEXT PRIMARY KEY,
        userId TEXT NOT NULL
      );
    `);
    // add missing columns for existing databases
    const taskColumns = this.db.prepare(`PRAGMA table_info('tasks')`).all() as any[];
    const hasParent = taskColumns.some((c) => c.name === 'parentTaskId');
    if (!hasParent) {
      try {
        this.db.exec(`ALTER TABLE tasks ADD COLUMN parentTaskId TEXT;`);
      } catch {
        // ignore if already exists
      }
    }

    const userColumns = this.db.prepare(`PRAGMA table_info('users')`).all() as any[];
    const hasCompanyRoles = userColumns.some((c) => c.name === 'companyRoles');
    if (!hasCompanyRoles) {
      try {
        this.db.exec(`ALTER TABLE users ADD COLUMN companyRoles TEXT;`);
      } catch {
        // ignore
      }
    }
  }

  private seedIfEmpty() {
    const existing = this.db.prepare('SELECT COUNT(*) as count FROM companies').get() as { count: number };
    if (existing.count === 0) {
      this.reset();
    }
  }

  reset() {
    const trx = this.db.transaction(() => {
      this.db.exec(`
        DELETE FROM tokens;
        DELETE FROM payments;
        DELETE FROM invoices;
        DELETE FROM clients;
        DELETE FROM comments;
        DELETE FROM tasks;
        DELETE FROM projects;
        DELETE FROM users;
        DELETE FROM positions;
        DELETE FROM companies;
      `);

      const insertCompany = this.db.prepare(
        'INSERT INTO companies (id, name, website, address) VALUES (@id, @name, @website, @address)',
      );
      const insertPosition = this.db.prepare(
        'INSERT INTO positions (id, title, companyId) VALUES (@id, @title, @companyId)',
      );
      const insertUser = this.db.prepare(
        'INSERT INTO users (id, name, email, role, companyIds, positionId, companyRoles, avatar, password) VALUES (@id, @name, @email, @role, @companyIds, @positionId, @companyRoles, @avatar, @password)',
      );
      const insertProject = this.db.prepare(
        'INSERT INTO projects (id, name, description, color, companyId, visibility, memberIds, clientId) VALUES (@id, @name, @description, @color, @companyId, @visibility, @memberIds, @clientId)',
      );
      const insertTask = this.db.prepare(
        'INSERT INTO tasks (id, title, description, status, priority, createdAt, dueDate, assignedUserIds, tags, companyId, projectId, color, dependencies, parentTaskId, invoiceImage, invoiceVendor, invoiceNumber, invoiceAmount, invoiceDate, generatedInvoiceId) VALUES (@id, @title, @description, @status, @priority, @createdAt, @dueDate, @assignedUserIds, @tags, @companyId, @projectId, @color, @dependencies, @parentTaskId, @invoiceImage, @invoiceVendor, @invoiceNumber, @invoiceAmount, @invoiceDate, @generatedInvoiceId)',
      );
      const insertComment = this.db.prepare(
        'INSERT INTO comments (id, taskId, userId, content, createdAt) VALUES (@id, @taskId, @userId, @content, @createdAt)',
      );
      const insertClient = this.db.prepare(
        'INSERT INTO clients (id, name, email, address, companyId) VALUES (@id, @name, @email, @address, @companyId)',
      );
      const insertInvoice = this.db.prepare(
        'INSERT INTO invoices (id, invoiceNumber, companyId, clientId, issueDate, dueDate, lineItems, total, status, notes, currency, taxRate, sentAt, paidAt) VALUES (@id, @invoiceNumber, @companyId, @clientId, @issueDate, @dueDate, @lineItems, @total, @status, @notes, @currency, @taxRate, @sentAt, @paidAt)',
      );

      seedData.companies.forEach((c) => insertCompany.run(c));
      seedData.positions.forEach((p) =>
        insertPosition.run({ ...p, companyId: p.companyId ?? null }),
      );
      seedData.users.forEach((u) =>
        insertUser.run({
          ...u,
          companyIds: JSON.stringify(u.companyIds),
          companyRoles: JSON.stringify(u.companyRoles || []),
          positionId: u.positionId ?? null,
        }),
      );
      seedData.projects.forEach((p) =>
        insertProject.run({
          ...p,
          memberIds: JSON.stringify(p.memberIds || []),
        }),
      );
      seedData.tasks.forEach((t) =>
        insertTask.run({
          id: t.id,
          title: t.title,
          description: t.description ?? null,
          status: t.status,
          priority: t.priority,
          createdAt: new Date(t.createdAt).toISOString(),
          dueDate: t.dueDate ? new Date(t.dueDate).toISOString() : null,
          assignedUserIds: JSON.stringify(t.assignedUserIds || []),
          tags: JSON.stringify(t.tags || []),
          companyId: t.companyId,
          projectId: t.projectId,
          color: t.color ?? null,
          dependencies: JSON.stringify(t.dependencies || []),
          parentTaskId: t.parentTaskId ?? null,
          invoiceImage: t.invoiceImage ?? null,
          invoiceVendor: t.invoiceVendor ?? null,
          invoiceNumber: t.invoiceNumber ?? null,
          invoiceAmount: t.invoiceAmount ?? null,
          invoiceDate: t.invoiceDate ? new Date(t.invoiceDate).toISOString() : null,
          generatedInvoiceId: t.generatedInvoiceId ?? null,
        }),
      );
      seedData.comments.forEach((c) =>
        insertComment.run({
          ...c,
          createdAt: new Date(c.createdAt).toISOString(),
        }),
      );
      seedData.clients.forEach((c) => insertClient.run(c));
      seedData.invoices.forEach((i) =>
        insertInvoice.run({
          ...i,
          issueDate: new Date(i.issueDate).toISOString(),
          dueDate: new Date(i.dueDate).toISOString(),
          lineItems: JSON.stringify(i.lineItems),
          notes: i.notes ?? null,
          currency: i.currency ?? 'USD',
          taxRate: i.taxRate ?? 0,
          sentAt: i.sentAt ? new Date(i.sentAt).toISOString() : null,
          paidAt: i.paidAt ? new Date(i.paidAt).toISOString() : null,
        }),
      );
    });

    trx();
  }

  // Token helpers
  issueToken(userId: string) {
    const token = uuid();
    this.db
      .prepare('INSERT INTO tokens (token, userId) VALUES (?, ?)')
      .run(token, userId);
    return token;
  }

  revokeToken(token: string) {
    this.db.prepare('DELETE FROM tokens WHERE token = ?').run(token);
  }

  getUserByToken(token: string): SanitizedUser | undefined {
    const row = this.db.prepare('SELECT userId FROM tokens WHERE token = ?').get(token) as { userId?: string } | undefined;
    if (!row?.userId) return undefined;
    return this.getUserById(row.userId);
  }

  private parseJson<T>(value: any): T | undefined {
    if (!value) return undefined;
    try {
      return JSON.parse(value);
    } catch {
      return undefined;
    }
  }

  sanitizeUser(row: any): SanitizedUser {
    const companyRoles = this.parseJson<CompanyRoleAssignment[]>(row.companyRoles) || [];
    const companyIds =
      companyRoles.length > 0
        ? Array.from(new Set(companyRoles.map((c) => c.companyId)))
        : this.parseJson<string[]>(row.companyIds) || [];

    return {
      id: row.id,
      name: row.name,
      email: row.email,
      role: row.role as UserRole,
      companyIds,
      positionId: row.positionId || undefined,
      companyRoles,
      avatar: row.avatar,
    };
  }

  listCompanies(): Company[] {
    return this.db.prepare('SELECT * FROM companies').all() as Company[];
  }

  getCompanyById(id: string): Company | undefined {
    return this.db.prepare('SELECT * FROM companies WHERE id = ?').get(id) as Company | undefined;
  }

  createCompany(company: Omit<Company, 'id'>): Company {
    const newCompany = { ...company, id: uuid() };
    this.db
      .prepare('INSERT INTO companies (id, name, website, address) VALUES (@id, @name, @website, @address)')
      .run(newCompany);
    return newCompany;
  }

  deleteCompany(id: string) {
    this.db.prepare('DELETE FROM companies WHERE id = ?').run(id);
  }

  listPositions(): Position[] {
    return this.db.prepare('SELECT * FROM positions').all() as Position[];
  }

  getPositionById(id: string): Position | undefined {
    return this.db.prepare('SELECT * FROM positions WHERE id = ?').get(id) as Position | undefined;
  }

  createPosition(position: Omit<Position, 'id'>): Position {
    const newPosition = { ...position, id: uuid(), companyId: position.companyId };
    this.db
      .prepare('INSERT INTO positions (id, title, companyId) VALUES (@id, @title, @companyId)')
      .run({ ...newPosition, companyId: newPosition.companyId ?? null });
    return newPosition;
  }

  deletePosition(id: string) {
    this.db.prepare('DELETE FROM positions WHERE id = ?').run(id);
  }

  listUsers(): SanitizedUser[] {
    const rows = this.db.prepare('SELECT * FROM users').all();
    return rows.map((r: any) => this.sanitizeUser(r));
  }

  getUserById(id: string): SanitizedUser | undefined {
    const row = this.db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    return row ? this.sanitizeUser(row) : undefined;
  }

  findUserByEmail(email: string): User | undefined {
    const row = this.db
      .prepare('SELECT * FROM users WHERE LOWER(email) = LOWER(?)')
      .get(email) as any;
    if (!row) return undefined;
    return {
      ...this.sanitizeUser(row),
      password: row.password,
    };
  }

  getUsersByCompany(companyId: string): SanitizedUser[] {
    const rows = this.db.prepare('SELECT * FROM users').all();
    return rows
      .filter((r: any) => {
        const roles = this.parseJson<CompanyRoleAssignment[]>(r.companyRoles);
        if (roles && roles.length > 0) {
          return roles.some((c) => c.companyId === companyId);
        }
        const ids = this.parseJson<string[]>(r.companyIds) || [];
        return ids.includes(companyId);
      })
      .map((r: any) => this.sanitizeUser(r));
  }

  createUser(user: CreateUserInput): SanitizedUser {
    const existingByEmail = this.findUserByEmail(user.email);
    if (existingByEmail) {
      if (user.id && existingByEmail.id === user.id) {
        const updatedUser: User = { ...existingByEmail, ...user, password: user.password };
        this.db
          .prepare(
            'UPDATE users SET name=@name, email=@email, role=@role, companyIds=@companyIds, positionId=@positionId, avatar=@avatar, password=@password WHERE id=@id',
          )
          .run({
            ...updatedUser,
            companyIds: JSON.stringify(updatedUser.companyIds),
          });
        return this.sanitizeUser(updatedUser);
      }
      throw new Error('Email already exists');
    }

    const normalizedCompanyRoles: CompanyRoleAssignment[] =
      user.companyRoles && user.companyRoles.length > 0
        ? user.companyRoles
        : (user.companyIds || []).map((cid) => ({
            companyId: cid,
            role: (user.role as UserRole) || 'Employee',
            positionId: user.positionId,
          }));

    const newUser: User = {
      ...user,
      id: user.id ?? uuid(),
      password: user.password,
      companyIds: normalizedCompanyRoles.map((c) => c.companyId),
      companyRoles: normalizedCompanyRoles,
      role: user.role || normalizedCompanyRoles[0]?.role || 'Employee',
      positionId: user.positionId,
    };

    this.db
      .prepare(
        'INSERT INTO users (id, name, email, role, companyIds, positionId, companyRoles, avatar, password) VALUES (@id, @name, @email, @role, @companyIds, @positionId, @companyRoles, @avatar, @password)',
      )
      .run({
        ...newUser,
        companyIds: JSON.stringify(newUser.companyIds || []),
        companyRoles: JSON.stringify(newUser.companyRoles || []),
      });
    return this.sanitizeUser(newUser);
  }

  updateUser(userId: string, updates: Partial<Omit<User, 'id'>>) {
    const existing = this.db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as any;
    if (!existing) return undefined;
    const existingCompanyRoles =
      this.parseJson<CompanyRoleAssignment[]>(existing.companyRoles) ||
      (this.parseJson<string[]>(existing.companyIds) || []).map((cid: string) => ({
        companyId: cid,
        role: existing.role as UserRole,
        positionId: existing.positionId || undefined,
      }));

    const nextCompanyRoles: CompanyRoleAssignment[] =
      updates.companyRoles && updates.companyRoles.length > 0
        ? updates.companyRoles
        : existingCompanyRoles;

    const updatedCompanyIds = updates.companyIds ?? nextCompanyRoles.map((c) => c.companyId);

    const updated = {
      ...existing,
      ...updates,
      role: updates.role || existing.role,
      positionId: updates.positionId ?? existing.positionId,
      companyIds: JSON.stringify(updatedCompanyIds),
      companyRoles: JSON.stringify(nextCompanyRoles),
    };
    this.db
      .prepare(
        'UPDATE users SET name=@name, email=@email, role=@role, companyIds=@companyIds, positionId=@positionId, companyRoles=@companyRoles, avatar=@avatar, password=@password WHERE id=@id',
      )
      .run(updated);
    return this.sanitizeUser({ ...existing, ...updates });
  }

  deleteUser(userId: string) {
    this.db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  }

  listProjects(): Project[] {
    const rows = this.db.prepare('SELECT * FROM projects').all() as any[];
    return rows.map((r) => ({
      ...r,
      memberIds: this.parseJson<string[]>(r.memberIds) || [],
      clientId: r.clientId || undefined,
    }));
  }

  getProjectById(id: string): Project | undefined {
    const row = this.db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as any;
    if (!row) return undefined;
    return { ...row, memberIds: this.parseJson<string[]>(row.memberIds) || [], clientId: row.clientId || undefined };
  }

  createProject(project: Omit<Project, 'id'>): Project {
    const newProject: Project = {
      ...project,
      id: uuid(),
      memberIds: project.memberIds || [],
      clientId: project.clientId ?? undefined,
      description: project.description ?? null,
      color: project.color ?? null,
    };
    this.db
      .prepare(
        'INSERT INTO projects (id, name, description, color, companyId, visibility, memberIds, clientId) VALUES (@id, @name, @description, @color, @companyId, @visibility, @memberIds, @clientId)',
      )
      .run({
        id: newProject.id,
        name: newProject.name,
        description: newProject.description,
        color: newProject.color,
        companyId: newProject.companyId,
        visibility: newProject.visibility,
        memberIds: JSON.stringify(newProject.memberIds || []),
        clientId: newProject.clientId,
      });
    return newProject;
  }

  updateProject(id: string, updates: Partial<Omit<Project, 'id'>>) {
    const existing = this.db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as any;
    if (!existing) return undefined;
    const updatedMemberIds =
      updates.memberIds ?? (this.parseJson<string[]>(existing.memberIds) || []);
    const updated = {
      ...existing,
      ...updates,
      memberIds: JSON.stringify(updatedMemberIds),
      clientId: updates.clientId ?? existing.clientId ?? undefined,
      description: updates.description ?? existing.description ?? null,
      color: updates.color ?? existing.color ?? null,
    };
    this.db
      .prepare(
        'UPDATE projects SET name=@name, description=@description, color=@color, companyId=@companyId, visibility=@visibility, memberIds=@memberIds, clientId=@clientId WHERE id=@id',
      )
      .run(updated);
    return {
      ...existing,
      ...updates,
      memberIds: updatedMemberIds,
      clientId: updated.clientId,
      description: updated.description,
      color: updated.color,
    };
  }

  deleteProject(id: string) {
    const trx = this.db.transaction(() => {
      this.db.prepare('DELETE FROM tasks WHERE projectId = ?').run(id);
      this.db.prepare('DELETE FROM projects WHERE id = ?').run(id);
    });
    trx();
  }

  addProjectMember(projectId: string, userId: string) {
    const project = this.getProjectById(projectId);
    if (!project) return undefined;
    const memberSet = new Set(project.memberIds || []);
    memberSet.add(userId);
    return this.updateProject(projectId, { memberIds: Array.from(memberSet) });
  }

  removeProjectMember(projectId: string, userId: string) {
    const project = this.getProjectById(projectId);
    if (!project) return undefined;
    const filtered = (project.memberIds || []).filter((id) => id !== userId);
    return this.updateProject(projectId, { memberIds: filtered });
  }

  listTasks(): Task[] {
    const rows = this.db.prepare('SELECT * FROM tasks').all() as any[];
    return rows.map((r) => this.decodeTask(r));
  }

  getTaskById(id: string): Task | undefined {
    const row = this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as any;
    if (!row) return undefined;
    return this.decodeTask(row);
  }

  getTasksByClient(companyId: string, clientId: string): Task[] {
    const rows = this.db
      .prepare(
        `SELECT t.*
         FROM tasks t
         JOIN projects p ON p.id = t.projectId
         WHERE p.companyId = ? AND p.clientId = ?`,
      )
      .all(companyId, clientId) as any[];
    return rows.map((r) => this.decodeTask(r));
  }

  private decodeTask(row: any): Task {
    return {
      ...row,
      createdAt: new Date(row.createdAt),
      dueDate: row.dueDate ? new Date(row.dueDate) : undefined,
      assignedUserIds: this.parseJson<string[]>(row.assignedUserIds) || [],
      tags: this.parseJson<string[]>(row.tags) || [],
      dependencies: this.parseJson<string[]>(row.dependencies) || [],
      parentTaskId: row.parentTaskId || undefined,
      invoiceDate: row.invoiceDate ? new Date(row.invoiceDate) : undefined,
    };
  }

  createTask(task: CreateTaskInput): Task {
    const newTask: Task = {
      ...task,
      id: uuid(),
      status: task.status ?? 'To Do',
      createdAt: task.createdAt ? new Date(task.createdAt) : new Date(),
    };
    this.db
      .prepare(
        'INSERT INTO tasks (id, title, description, status, priority, createdAt, dueDate, assignedUserIds, tags, companyId, projectId, color, dependencies, parentTaskId, invoiceImage, invoiceVendor, invoiceNumber, invoiceAmount, invoiceDate, generatedInvoiceId) VALUES (@id, @title, @description, @status, @priority, @createdAt, @dueDate, @assignedUserIds, @tags, @companyId, @projectId, @color, @dependencies, @parentTaskId, @invoiceImage, @invoiceVendor, @invoiceNumber, @invoiceAmount, @invoiceDate, @generatedInvoiceId)',
      )
      .run({
        id: newTask.id,
        title: newTask.title,
        description: newTask.description ?? null,
        status: newTask.status,
        priority: newTask.priority,
        createdAt: newTask.createdAt.toISOString(),
        dueDate: newTask.dueDate ? new Date(newTask.dueDate).toISOString() : null,
        assignedUserIds: JSON.stringify(newTask.assignedUserIds || []),
        tags: JSON.stringify(newTask.tags || []),
        companyId: newTask.companyId,
        projectId: newTask.projectId,
        color: newTask.color ?? null,
        dependencies: JSON.stringify(newTask.dependencies || []),
        parentTaskId: newTask.parentTaskId ?? null,
        invoiceImage: newTask.invoiceImage ?? null,
        invoiceVendor: newTask.invoiceVendor ?? null,
        invoiceNumber: newTask.invoiceNumber ?? null,
        invoiceAmount: newTask.invoiceAmount ?? null,
        invoiceDate: newTask.invoiceDate ? new Date(newTask.invoiceDate).toISOString() : null,
        generatedInvoiceId: newTask.generatedInvoiceId ?? null,
      });
    return newTask;
  }

  updateTask(id: string, updates: UpdateTaskInput) {
    const existing = this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as any;
    if (!existing) return undefined;
    const updatedAssigned = updates.assignedUserIds ?? (this.parseJson<string[]>(existing.assignedUserIds) || []);
    const updatedTags = updates.tags ?? (this.parseJson<string[]>(existing.tags) || []);
    const updatedDeps = updates.dependencies ?? (this.parseJson<string[]>(existing.dependencies) || []);
    const updated = {
      ...existing,
      ...updates,
      createdAt: existing.createdAt,
      dueDate: updates.dueDate ? new Date(updates.dueDate).toISOString() : existing.dueDate,
      assignedUserIds: JSON.stringify(updatedAssigned),
      tags: JSON.stringify(updatedTags),
      dependencies: JSON.stringify(updatedDeps),
      parentTaskId: updates.parentTaskId ?? existing.parentTaskId ?? null,
      invoiceDate: updates.invoiceDate
        ? new Date(updates.invoiceDate).toISOString()
        : existing.invoiceDate,
    };

    this.db
      .prepare(
        'UPDATE tasks SET title=@title, description=@description, status=@status, priority=@priority, createdAt=@createdAt, dueDate=@dueDate, assignedUserIds=@assignedUserIds, tags=@tags, companyId=@companyId, projectId=@projectId, color=@color, dependencies=@dependencies, invoiceImage=@invoiceImage, invoiceVendor=@invoiceVendor, invoiceNumber=@invoiceNumber, invoiceAmount=@invoiceAmount, invoiceDate=@invoiceDate, generatedInvoiceId=@generatedInvoiceId WHERE id=@id',
      )
      .run(updated);

    return this.decodeTask({ ...existing, ...updates, ...updated });
  }

  markTasksAsInvoiced(taskIds: string[], invoiceId: string) {
    const stmt = this.db.prepare('UPDATE tasks SET generatedInvoiceId = ? WHERE id = ?');
    const trx = this.db.transaction(() => {
      taskIds.forEach((id) => stmt.run(invoiceId, id));
    });
    trx();
  }

  listCommentsByTask(taskId: string): Comment[] {
    const rows = this.db.prepare('SELECT * FROM comments WHERE taskId = ?').all(taskId) as any[];
    return rows.map((r) => ({
      ...r,
      createdAt: new Date(r.createdAt),
    }));
  }

  createComment(comment: Omit<Comment, 'id' | 'createdAt'> & { createdAt?: Date | string }) {
    const newComment: Comment = {
      ...comment,
      id: uuid(),
      createdAt: comment.createdAt ? new Date(comment.createdAt) : new Date(),
    };
    this.db
      .prepare('INSERT INTO comments (id, taskId, userId, content, createdAt) VALUES (@id, @taskId, @userId, @content, @createdAt)')
      .run({
        ...newComment,
        createdAt: newComment.createdAt.toISOString(),
      });
    return newComment;
  }

  listClients(companyId: string): Client[] {
    return this.db
      .prepare('SELECT * FROM clients WHERE companyId = ?')
      .all(companyId) as Client[];
  }

  createClient(client: Omit<Client, 'id'>): Client {
    const newClient = { ...client, id: uuid() };
    this.db
      .prepare('INSERT INTO clients (id, name, email, address, companyId) VALUES (@id, @name, @email, @address, @companyId)')
      .run(newClient);
    return newClient;
  }

  listInvoices(companyId: string): Invoice[] {
    const rows = this.db
      .prepare('SELECT * FROM invoices WHERE companyId = ?')
      .all(companyId) as any[];
    return rows.map((row) => this.decodeInvoice(row));
  }

  createInvoice(invoice: Omit<Invoice, 'id'> & { issueDate: Date | string; dueDate: Date | string }) {
    const newInvoice: Invoice = {
      ...invoice,
      id: uuid(),
      issueDate: new Date(invoice.issueDate),
      dueDate: new Date(invoice.dueDate),
    };
    this.db
      .prepare(
        'INSERT INTO invoices (id, invoiceNumber, companyId, clientId, issueDate, dueDate, lineItems, total, status, notes, currency, taxRate, sentAt, paidAt) VALUES (@id, @invoiceNumber, @companyId, @clientId, @issueDate, @dueDate, @lineItems, @total, @status, @notes, @currency, @taxRate, @sentAt, @paidAt)',
      )
      .run({
        ...newInvoice,
        issueDate: newInvoice.issueDate.toISOString(),
        dueDate: newInvoice.dueDate.toISOString(),
        lineItems: JSON.stringify(newInvoice.lineItems),
        notes: newInvoice.notes ?? null,
        currency: newInvoice.currency ?? 'USD',
        taxRate: newInvoice.taxRate ?? 0,
        sentAt: newInvoice.sentAt ? newInvoice.sentAt.toISOString() : null,
        paidAt: newInvoice.paidAt ? newInvoice.paidAt.toISOString() : null,
      });
    return newInvoice;
  }

  updateInvoiceStatus(invoiceId: string, status: InvoiceStatus) {
    const existing = this.db.prepare('SELECT * FROM invoices WHERE id = ?').get(invoiceId) as any;
    if (!existing) return undefined;

    const sentAt = status === 'Sent' ? new Date().toISOString() : existing.sentAt;
    const paidAt = status === 'Paid' ? new Date().toISOString() : status === 'Draft' ? null : existing.paidAt;

    this.db
      .prepare('UPDATE invoices SET status = ?, sentAt = ?, paidAt = ? WHERE id = ?')
      .run(status, sentAt, paidAt, invoiceId);
    return this.decodeInvoice({ ...existing, status, sentAt, paidAt });
  }

  updateInvoice(invoiceId: string, updates: Partial<Omit<Invoice, 'id'>>) {
    const existing = this.db.prepare('SELECT * FROM invoices WHERE id = ?').get(invoiceId) as any;
    if (!existing) return undefined;
    const merged = {
      ...existing,
      ...updates,
      issueDate: (updates.issueDate ? new Date(updates.issueDate) : new Date(existing.issueDate)).toISOString(),
      dueDate: (updates.dueDate ? new Date(updates.dueDate) : new Date(existing.dueDate)).toISOString(),
      lineItems: JSON.stringify(
        updates.lineItems ?? (this.parseJson(existing.lineItems) || []),
      ),
      notes: updates.notes ?? existing.notes,
      currency: updates.currency ?? existing.currency ?? 'USD',
      taxRate: updates.taxRate ?? existing.taxRate ?? 0,
      sentAt: updates.sentAt ? new Date(updates.sentAt).toISOString() : existing.sentAt,
      paidAt: updates.paidAt ? new Date(updates.paidAt).toISOString() : existing.paidAt,
      total: updates.total ?? existing.total,
      status: updates.status ?? existing.status,
    };
    this.db
      .prepare(
        'UPDATE invoices SET invoiceNumber=@invoiceNumber, companyId=@companyId, clientId=@clientId, issueDate=@issueDate, dueDate=@dueDate, lineItems=@lineItems, total=@total, status=@status, notes=@notes, currency=@currency, taxRate=@taxRate, sentAt=@sentAt, paidAt=@paidAt WHERE id=@id',
      )
      .run({ ...merged, id: invoiceId });
    return this.decodeInvoice({ ...merged, id: invoiceId });
  }

  private decodeInvoice(row: any): Invoice {
    return {
      ...row,
      issueDate: new Date(row.issueDate),
      dueDate: new Date(row.dueDate),
      lineItems: this.parseJson(row.lineItems) || [],
      notes: row.notes ?? undefined,
      currency: row.currency ?? 'USD',
      taxRate: row.taxRate ?? 0,
      sentAt: row.sentAt ? new Date(row.sentAt) : undefined,
      paidAt: row.paidAt ? new Date(row.paidAt) : undefined,
    };
  }

  listPayments(invoiceId: string): Payment[] {
    const rows = this.db
      .prepare('SELECT * FROM payments WHERE invoiceId = ? ORDER BY paidAt ASC')
      .all(invoiceId) as any[];
    return rows.map((r) => ({
      ...r,
      paidAt: new Date(r.paidAt),
    }));
  }

  createPayment(payment: Omit<Payment, 'id'>) {
    const newPayment: Payment = {
      ...payment,
      id: uuid(),
      paidAt: payment.paidAt ? new Date(payment.paidAt) : new Date(),
    };
    this.db
      .prepare('INSERT INTO payments (id, invoiceId, amount, method, note, paidAt) VALUES (@id, @invoiceId, @amount, @method, @note, @paidAt)')
      .run({
        ...newPayment,
        paidAt: newPayment.paidAt.toISOString(),
      });
    this.refreshInvoicePaymentStatus(newPayment.invoiceId);
    return newPayment;
  }

  private refreshInvoicePaymentStatus(invoiceId: string) {
    const invoice = this.db.prepare('SELECT * FROM invoices WHERE id = ?').get(invoiceId) as any;
    if (!invoice) return;
    const payments = this.listPayments(invoiceId);
    const paidTotal = payments.reduce((sum, p) => sum + p.amount, 0);
    let status: InvoiceStatus = invoice.status;
    let paidAt = invoice.paidAt;

    if (paidTotal >= invoice.total) {
      status = 'Paid';
      paidAt = new Date().toISOString();
    } else if (status === 'Paid') {
      status = 'Sent';
      paidAt = null;
    }

    this.db
      .prepare('UPDATE invoices SET status = ?, paidAt = ? WHERE id = ?')
      .run(status, paidAt, invoiceId);
  }
}
