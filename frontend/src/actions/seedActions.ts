'use server';

/**
 * @fileOverview Server action for database seeding.
 * Calls the backend /seed endpoint directly (no Genkit).
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000';

export async function runSeedDatabase() {
  const res = await fetch(`${API_BASE_URL}/seed`, { method: 'POST' });
  if (!res.ok) {
    const msg = await res.text();
    return { success: false, message: msg || 'Seeding failed' };
  }
  return { success: true, message: 'Database seeded successfully!' };
}
