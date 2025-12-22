'use server';
/**
 * @fileOverview A Genkit flow for resetting the backend datastore with placeholder data.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000';

export const seedDatabaseFlow = ai.defineFlow(
  {
    name: 'seedDatabaseFlow',
    inputSchema: z.void(),
    outputSchema: z.object({ success: z.boolean(), message: z.string() }),
  },
  async () => {
    try {
      console.log('[SEED] Requesting backend seed reset...');
      const response = await fetch(`${API_BASE_URL}/seed`, { method: 'POST' });
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || 'Backend seed failed.');
      }
      console.log('[SEED] Backend reset succeeded.');
      return { success: true, message: 'Backend seed completed.' };
    } catch (error) {
      console.error('[SEED ERROR]', error);
      const message = error instanceof Error ? error.message : 'Unknown error occurred.';
      return { success: false, message: `Seeding failed: ${message}` };
    }
  },
);
