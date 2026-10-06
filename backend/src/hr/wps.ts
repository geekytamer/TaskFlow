import type { DataStore } from '../data/store';

/**
 * The salary file for Oman's Wage Protection System: an employer record (CR
 * number, the account salaries are paid from, the month, total and count),
 * then one record per employee (ID, bank, account, pay). Banks take this as a
 * CSV and map it to their own SIF layout, so the columns are named in full.
 * Every missing detail is reported together, because a file the bank rejects,
 * or one that silently skips someone, is worse than no file.
 */
export class WpsDataError extends Error {
  constructor(public readonly problems: string[]) {
    super(`The WPS file cannot be built yet: ${problems.join('; ')}.`);
  }
}

const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
const row = (cells: unknown[]) => cells.map(esc).join(',');

export function buildWpsFile(store: DataStore, runId: string): string {
  const run = store.getPayrollRunById(runId);
  if (!run) throw new Error('Payroll run not found.');
  const company = store.getCompanyById(run.companyId);
  if (!company) throw new Error('Company not found.');

  const problems: string[] = [];
  if (!company.registrationNumber?.trim()) problems.push('the company has no CR (registration) number');
  if (!company.payrollAccount?.trim()) problems.push('the company has no payroll account (IBAN)');
  if (!company.payrollBankCode?.trim()) problems.push("the company's payroll bank code (SWIFT) is missing");
  const lines = run.payslips.map((slip) => ({ slip, employee: store.getEmployeeById(slip.employeeId) }));
  for (const { slip, employee } of lines) {
    const missing = [
      !employee?.idNumber?.trim() && 'Civil ID or passport number',
      !employee?.iban?.trim() && 'IBAN',
      !employee?.bankCode?.trim() && 'bank SWIFT code',
    ].filter(Boolean);
    if (missing.length) problems.push(`${slip.employeeName} has no ${missing.join(', ')}`);
  }
  if (problems.length) throw new WpsDataError(problems);

  const [year, month] = run.period.split('-').map(Number);
  const workingDays = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const total = run.payslips.reduce((sum, s) => sum + s.net, 0);
  return [
    row(['Employer CR Number', 'Payer Bank Code', 'Payer Account', 'Salary Year', 'Salary Month', 'Total Salaries', 'Number of Records', 'Payment Type']),
    row([company.registrationNumber, company.payrollBankCode, company.payrollAccount, year, String(month).padStart(2, '0'), total.toFixed(3), run.payslips.length, 'Salary']),
    row(['Employee ID Type', 'Employee ID', 'Reference', 'Employee Name', 'Employee Bank Code', 'Employee Account', 'Salary Frequency', 'Number of Working Days', 'Net Salary', 'Basic Salary', 'Extra Hours', 'Extra Income', 'Deductions', 'Social Security Deductions', 'Notes']),
    ...lines.map(({ slip, employee }) => row([
      employee!.idType === 'passport' ? 'P' : 'C', employee!.idNumber, slip.id.slice(0, 16), slip.employeeName,
      employee!.bankCode, employee!.iban, 'M', workingDays, slip.net.toFixed(3), slip.basic.toFixed(3), 0,
      slip.allowances.toFixed(3), slip.deductions.toFixed(3), '0.000', '',
    ])),
  ].join('\r\n');
}
