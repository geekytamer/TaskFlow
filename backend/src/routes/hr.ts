import { WpsDataError } from '../hr/wps';
import type { Employee, PayrollRun } from '../types';
import { HttpError, canAccessCompany } from '../http';
import { asRecord, enumValue, optionalString, requiredNumber, requiredString } from '../validation';
import type { RouteContext } from './context';
import { type AuthedRequest, companyManagementRoles, handler } from './shared';
import type { Express } from 'express';

/** HR: departments, employees, leave, attendance and payroll. */
export function registerHrRoutes(app: Express, ctx: RouteContext): void {
  const { store, authMiddleware, requireCompanyAccess, requireCompanyRoles, withActor, maskFor, seesField, requireFieldEdit, requireFieldEdits, forbidden } = ctx;

  app.get('/companies/:companyId/departments', authMiddleware, handler((req, res) => {
    requireCompanyAccess(req, req.params.companyId);
    res.json(store.listDepartments(req.params.companyId));
  }));
  app.post('/companies/:companyId/departments', authMiddleware, handler((req, res) => {
    requireCompanyRoles(req, req.params.companyId, companyManagementRoles);
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    if (!name) throw new HttpError(400, 'Department name is required.');
    res.status(201).json(store.createDepartment({ companyId: req.params.companyId, name }));
  }));
  app.put('/departments/:id', authMiddleware, handler((req, res) => {
    const dept = store.getDepartmentById(req.params.id);
    if (!dept) throw new HttpError(404, 'Department not found.');
    requireCompanyRoles(req, dept.companyId, companyManagementRoles);
    res.json(store.updateDepartment(req.params.id, { name: typeof req.body?.name === 'string' ? req.body.name.trim() : undefined }));
  }));

  /**
   * Pay, bank and ID details: the salary / bank_details / personal_ids fields
   * (authz/mask.ts), and always the employee themself.
   */
  const employeeFor = (req: AuthedRequest, employee: Employee, moduleLock = false): Partial<Employee> =>
    maskFor(req, employee.companyId, 'employee', employee, { self: !!employee.userId && employee.userId === req.user?.id, moduleLock });

  /** Payroll runs with each payslip's figures masked (own payslip shown); employees read once. */
  const runsFor = (req: AuthedRequest, companyId: string, runs: PayrollRun[]): PayrollRun[] => {
    const userOf = new Map(store.listEmployees(companyId).map((e) => [e.id, e.userId]));
    return runs.map((run) => ({
      ...run,
      payslips: run.payslips.map((slip) => maskFor(req, run.companyId, 'payslip', slip, { self: !!req.user && userOf.get(slip.employeeId) === req.user.id })),
    }));
  };
  const runFor = (req: AuthedRequest, run: PayrollRun): PayrollRun => runsFor(req, run.companyId, [run])[0];

  /**
   * Linking an employee record to a login makes its pay, IDs and bank details
   * that person's own (the self exception). So setting or changing the link is
   * a write of all three fields, and the person linked must belong to the
   * company. Unlinking takes access away and needs neither.
   */
  const requireUserLink = (req: AuthedRequest, companyId: string, body: Record<string, unknown> | undefined, existing?: Employee) => {
    if (!body || body.userId === undefined) return;
    const next = typeof body.userId === 'string' && body.userId.trim() ? body.userId.trim() : null;
    if (next === null || next === (existing?.userId ?? null)) return;
    const user = store.getUserById(next);
    if (!user || !canAccessCompany(user, companyId)) throw new HttpError(400, 'The linked user is not a member of this company.');
    for (const field of ['salary', 'personal_ids', 'bank_details'] as const) requireFieldEdit(req, companyId, field);
  };

  app.get('/companies/:companyId/employees', authMiddleware, handler((req, res) => {
    requireCompanyAccess(req, req.params.companyId);
    // The old PAYROLL_PAY_READ was asked here: payroll off hides pay (moduleLock).
    res.json(store.listEmployees(req.params.companyId).map((e) => employeeFor(req, e, true)));
  }));
  app.post('/companies/:companyId/employees', authMiddleware, handler((req, res) => {
    requireCompanyRoles(req, req.params.companyId, companyManagementRoles);
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    if (!name) throw new HttpError(400, 'Employee name is required.');
    requireFieldEdits(req, req.params.companyId, 'employee', req.body, 'create');
    requireUserLink(req, req.params.companyId, req.body);
    res.status(201).json(employeeFor(req, store.createEmployee({ ...req.body, companyId: req.params.companyId, name })));
  }));
  app.get('/employees/:id', authMiddleware, handler((req, res) => {
    const employee = store.getEmployeeById(req.params.id);
    if (!employee) throw new HttpError(404, 'Employee not found.');
    requireCompanyAccess(req, employee.companyId);
    res.json(employeeFor(req, employee, true));
  }));
  app.put('/employees/:id', authMiddleware, handler((req, res) => {
    const employee = store.getEmployeeById(req.params.id);
    if (!employee) throw new HttpError(404, 'Employee not found.');
    requireCompanyRoles(req, employee.companyId, companyManagementRoles);
    requireFieldEdits(req, employee.companyId, 'employee', req.body, employee);
    requireUserLink(req, employee.companyId, req.body, employee);
    const updated = store.updateEmployee(req.params.id, req.body || {});
    res.json(updated ? employeeFor(req, updated) : updated);
  }));
  app.get('/employees/:id/leave-balance', authMiddleware, handler((req, res) => {
    const employee = store.getEmployeeById(req.params.id);
    if (!employee) throw new HttpError(404, 'Employee not found.');
    requireCompanyAccess(req, employee.companyId);
    const year = req.query.year ? Number(req.query.year) : undefined;
    res.json(store.getLeaveBalance(req.params.id, year));
  }));

  // ─── Attendance ─────────────────────────────────────────────────────────────
  app.get('/companies/:companyId/attendance', authMiddleware, handler((req, res) => {
    requireCompanyRoles(req, req.params.companyId, companyManagementRoles);
    res.json(store.listAttendance(req.params.companyId, {
      employeeId: optionalString(req.query.employeeId),
      from: optionalString(req.query.from),
      to: optionalString(req.query.to),
    }));
  }));
  app.post('/companies/:companyId/attendance', authMiddleware, handler((req, res) => {
    requireCompanyRoles(req, req.params.companyId, companyManagementRoles);
    const body = asRecord(req.body, 'body');
    try {
      const record = store.upsertAttendance({
        companyId: req.params.companyId,
        employeeId: requiredString(body.employeeId, 'employeeId'),
        date: requiredString(body.date, 'date'),
        status: enumValue(body.status, 'status', ['present', 'absent', 'leave', 'holiday']) as any,
        hours: body.hours !== undefined ? requiredNumber(body.hours, 'hours') : undefined,
        note: optionalString(body.note),
      });
      res.status(201).json(record);
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw new HttpError(400, error instanceof Error ? error.message : 'Could not record attendance.');
    }
  }));
  app.delete('/attendance/:id', authMiddleware, handler((req, res) => {
    // Check who is asking before anything is removed.
    const record = store.getAttendanceById(req.params.id);
    if (!record) throw new HttpError(404, 'Attendance record not found.');
    requireCompanyRoles(req, record.companyId, companyManagementRoles);
    store.deleteAttendance(req.params.id);
    res.status(204).end();
  }));

  // ─── Payroll ──────────────────────────────────────────────────────────────
  app.get('/companies/:companyId/payroll-runs', authMiddleware, handler((req, res) => {
    requireCompanyRoles(req, req.params.companyId, companyManagementRoles);
    res.json(runsFor(req, req.params.companyId, store.listPayrollRuns(req.params.companyId)));
  }));
  app.post('/companies/:companyId/payroll-runs', authMiddleware, handler((req, res) => {
    requireCompanyRoles(req, req.params.companyId, companyManagementRoles);
    const body = asRecord(req.body, 'body');
    try {
      const run = withActor(req, () =>
        store.createPayrollRun(req.params.companyId, requiredString(body.period, 'period'), optionalString(body.notes)),
      );
      res.status(201).json(runFor(req, run));
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw new HttpError(400, error instanceof Error ? error.message : 'Could not create payroll run.');
    }
  }));
  const loadPayrollRun = (req: AuthedRequest) => {
    const run = store.getPayrollRunById(req.params.id);
    if (!run) throw new HttpError(404, 'Payroll run not found.');
    requireCompanyRoles(req, run.companyId, companyManagementRoles);
    return run;
  };
  app.get('/payroll-runs/:id', authMiddleware, handler((req, res) => {
    res.json(runFor(req, loadPayrollRun(req)));
  }));
  app.put('/payroll-runs/:id/status', authMiddleware, handler((req, res) => {
    loadPayrollRun(req);
    const body = asRecord(req.body, 'body');
    const status = enumValue(body.status, 'status', ['draft', 'approved', 'paid']) as any;
    const updated = store.updatePayrollRunStatus(req.params.id, status);
    res.json(updated ? runFor(req, updated) : updated);
  }));
  app.delete('/payroll-runs/:id', authMiddleware, handler((req, res) => {
    loadPayrollRun(req);
    store.deletePayrollRun(req.params.id);
    res.status(204).end();
  }));
  app.get('/payroll-runs/:id/wps', authMiddleware, handler((req, res) => {
    const run = loadPayrollRun(req);
    // The file carries every employee's pay, IBAN and ID number.
    for (const field of ['salary', 'bank_details', 'personal_ids'] as const) {
      if (!seesField(req, run.companyId, field)) throw forbidden(run.companyId, `field:${field}`);
    }
    let csv: string;
    try { csv = store.buildWpsCsv(req.params.id); }
    catch (error) {
      if (error instanceof WpsDataError) throw new HttpError(409, error.message, { problems: error.problems });
      throw error;
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="wps-${run.period}.csv"`);
    res.send(csv);
  }));

  app.get('/companies/:companyId/leave-types', authMiddleware, handler((req, res) => {
    requireCompanyAccess(req, req.params.companyId);
    res.json(store.listLeaveTypes(req.params.companyId));
  }));
  app.post('/companies/:companyId/leave-types', authMiddleware, handler((req, res) => {
    requireCompanyRoles(req, req.params.companyId, companyManagementRoles);
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    if (!name) throw new HttpError(400, 'Leave type name is required.');
    res.status(201).json(store.createLeaveType({ companyId: req.params.companyId, name, paid: req.body?.paid }));
  }));
  app.put('/leave-types/:id', authMiddleware, handler((req, res) => {
    const leaveType = store.getLeaveTypeById(req.params.id);
    if (!leaveType) throw new HttpError(404, 'Leave type not found.');
    requireCompanyRoles(req, leaveType.companyId, companyManagementRoles);
    res.json(store.updateLeaveType(req.params.id, { name: req.body?.name, paid: req.body?.paid }));
  }));

  app.get('/companies/:companyId/leave-requests', authMiddleware, handler((req, res) => {
    requireCompanyAccess(req, req.params.companyId);
    res.json(store.listLeaveRequests(req.params.companyId, {
      status: req.query.status as string | undefined,
      employeeId: req.query.employeeId as string | undefined,
    }));
  }));
  app.post('/companies/:companyId/leave-requests', authMiddleware, handler((req, res) => {
    requireCompanyRoles(req, req.params.companyId, companyManagementRoles);
    const body = req.body || {};
    if (!body.employeeId || !body.startDate || !body.endDate) {
      throw new HttpError(400, 'employeeId, startDate, and endDate are required.');
    }
    try {
      res.status(201).json(store.createLeaveRequest({
        companyId: req.params.companyId,
        employeeId: body.employeeId,
        leaveTypeId: body.leaveTypeId,
        startDate: body.startDate,
        endDate: body.endDate,
        days: body.days,
        reason: body.reason,
        status: body.status,
      }));
    } catch (error) {
      throw new HttpError(400, error instanceof Error ? error.message : 'Could not create leave request.');
    }
  }));
  app.put('/leave-requests/:id/status', authMiddleware, handler((req, res) => {
    const request = store.getLeaveRequestById(req.params.id);
    if (!request) throw new HttpError(404, 'Leave request not found.');
    requireCompanyRoles(req, request.companyId, companyManagementRoles);
    const status = req.body?.status;
    if (!['Pending', 'Approved', 'Rejected', 'Cancelled'].includes(status)) {
      throw new HttpError(400, 'Invalid leave request status.');
    }
    res.json(store.setLeaveRequestStatus(req.params.id, status, { userId: req.user?.id, name: req.user?.name }, req.body?.reviewNote));
  }));
}
