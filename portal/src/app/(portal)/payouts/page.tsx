import { redirect } from 'next/navigation';

/** Payouts are Peak income on the Money page now; links already sent keep working. */
export default function PayoutsPage() {
  redirect('/money');
}
