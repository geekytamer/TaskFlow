import { isApiError } from '@/lib/api-client';

/**
 * Resolves supplementary data, tolerating a permission refusal.
 *
 * Pages routinely load data from modules the viewer may not hold: the
 * inventory list shows a vendor column from Contacts and incoming quantities
 * from Purchasing. Once permissions are enforced per module, a warehouse clerk
 * legitimately cannot read those — and a single Promise.all would fail the
 * whole page over data that was only ever decoration.
 *
 * Only 403 is swallowed. A real failure — network, 500, a bad request — still
 * propagates, because that is a fault worth telling the user about.
 */
export async function optionalFetch<T>(promise: Promise<T>, fallback: T): Promise<T> {
  try {
    return await promise;
  } catch (error) {
    if (isApiError(error) && error.status === 403) return fallback;
    throw error;
  }
}
