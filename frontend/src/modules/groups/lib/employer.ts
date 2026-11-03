/**
 * Setting a person's employer in a company: link the company's HR record
 * that has their email and no login yet, or else start one carrying the login.
 */
export function employerAction(
  employees: ReadonlyArray<{ id: string; email?: string | null; userId?: string | null; status?: string | null }>,
  person: { id: string; name: string; email: string },
): { link: string } | { create: { name: string; email: string; userId: string } } {
  const email = person.email.trim().toLowerCase();
  // An ended record stays ended: the person starts a new employment.
  const match = employees.find((e) => !e.userId && e.status !== 'Terminated' && (e.email ?? '').trim().toLowerCase() === email);
  return match ? { link: match.id } : { create: { name: person.name, email: person.email, userId: person.id } };
}
