'use server';

/**
 * @fileOverview Server actions for database seeding.
 */

import { seedDatabaseFlow } from '@/ai/flows/seed-database';

/**
 * Runs the Genkit flow to seed the database with placeholder data.
 * This server action is called from the client-side Settings page.
 * @returns {Promise<{success: boolean, message: string}>} - The result of the seeding operation.
 */
export async function runSeedDatabase() {
  return await seedDatabaseFlow();
}
