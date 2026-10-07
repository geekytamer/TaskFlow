import { redirect } from 'next/navigation';

/** Assignments are Peak deals now; links already sent by email and WhatsApp keep working. */
export default function AssignmentsPage() {
  redirect('/deals?source=peak');
}
