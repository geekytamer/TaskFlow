'use server';
/**
 * Verbose Genkit flow for seeding the Firestore database with placeholder data.
 * Logs every stage to help debug where it fails.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { db } from '@/lib/firebase';
import { collection, doc, writeBatch, query, getDocs } from 'firebase/firestore';
import {
  placeholderCompanies,
  placeholderPositions,
  placeholderUsers,
  placeholderProjects,
  placeholderTasks,
} from '@/lib/placeholder-data';
import type { Task } from '@/modules/projects/types';

// Helper: delete all docs from a collection
async function deleteCollection(collectionName: string) {
  console.log(`[DELETE] Starting deletion for collection: ${collectionName}`);
  const colRef = collection(db, collectionName);
  const q = query(colRef);
  const snapshot = await getDocs(q);

  console.log(`[DELETE] ${collectionName} docs found: ${snapshot.size}`);

  if (snapshot.empty) {
    console.log(`[DELETE] ${collectionName} is already empty.`);
    return;
  }

  let batch = writeBatch(db);
  let i = 0;

  for (const docSnap of snapshot.docs) {
    batch.delete(docSnap.ref);
    i++;
    if (i % 500 === 0) {
      console.log(`[DELETE] Committing batch of 500 deletes for ${collectionName}...`);
      await batch.commit();
      batch = writeBatch(db);
    }
  }

  if (i % 500 !== 0) {
    console.log(`[DELETE] Committing final batch of ${i % 500} deletes for ${collectionName}...`);
    await batch.commit();
  }

  console.log(`[DELETE] Finished deleting ${snapshot.size} docs from ${collectionName}`);
}

export const seedDatabaseFlow = ai.defineFlow(
  {
    name: 'seedDatabaseFlow',
    inputSchema: z.void(),
    outputSchema: z.object({ success: z.boolean(), message: z.string() }),
  },
  async () => {
    try {
      console.log('=== [SEED] Starting database seed flow ===');

      // 1. Clear existing data
      console.log('[SEED] Clearing existing data...');
      const collectionsToClear = ['companies', 'positions', 'projects', 'tasks', 'comments'];
      for (const col of collectionsToClear) {
        console.log(`[SEED] Clearing collection: ${col}`);
        await deleteCollection(col);
      }

      // Clear users except admin
      console.log('[SEED] Clearing users except admin...');
      const usersRef = collection(db, 'users');
      const usersSnapshot = await getDocs(usersRef);
      console.log(`[SEED] Found ${usersSnapshot.size} users in "users"`);

      if (!usersSnapshot.empty) {
        const batch = writeBatch(db);
        let skipped = 0;
        let deleted = 0;
        usersSnapshot.forEach((docSnap) => {
          if (docSnap.data().email !== 'admin@taskflow.com') {
            batch.delete(docSnap.ref);
            deleted++;
          } else {
            skipped++;
          }
        });
        await batch.commit();
        console.log(`[SEED] Deleted ${deleted} users, skipped ${skipped} admin users.`);
      }

      // 2. Seed Companies
      console.log(`[SEED] Seeding ${placeholderCompanies.length} companies...`);
      const companiesBatch = writeBatch(db);
      placeholderCompanies.forEach((company) => {
        console.log(`[SEED] Preparing company: ${company.id}`);
        const docRef = doc(collection(db, 'companies'), company.id);
        companiesBatch.set(docRef, company);
      });
      await companiesBatch.commit();
      console.log('[SEED] Seeded companies.');

      // 3. Seed Positions
      console.log(`[SEED] Seeding ${placeholderPositions.length} positions...`);
      const positionsBatch = writeBatch(db);
      placeholderPositions.forEach((position) => {
        console.log(`[SEED] Preparing position: ${position.id}`);
        const docRef = doc(collection(db, 'positions'), position.id);
        positionsBatch.set(docRef, position);
      });
      await positionsBatch.commit();
      console.log('[SEED] Seeded positions.');

      // 4. Seed Users
      console.log(`[SEED] Seeding ${placeholderUsers.length} users...`);
      const usersBatch = writeBatch(db);
      placeholderUsers.forEach((user) => {
        if (user.email === 'admin@taskflow.com') {
          console.log(`[SEED] Skipping admin user: ${user.email}`);
          return;
        }
        console.log(`[SEED] Preparing user: ${user.id} (${user.email})`);
        const docRef = doc(collection(db, 'users'), user.id);
        usersBatch.set(docRef, user);
      });
      await usersBatch.commit();
      console.log('[SEED] Seeded non-admin users.');

      // 5. Seed Projects
      console.log(`[SEED] Seeding ${placeholderProjects.length} projects...`);
      const projectsBatch = writeBatch(db);
      placeholderProjects.forEach((project) => {
        console.log(`[SEED] Preparing project: ${project.id}`);
        const docRef = doc(collection(db, 'projects'), project.id);
        projectsBatch.set(docRef, project);
      });
      await projectsBatch.commit();
      console.log('[SEED] Seeded projects.');

      // 6. Seed Tasks
      console.log(`[SEED] Seeding ${placeholderTasks.length} tasks...`);
      const tasksBatch = writeBatch(db);
      placeholderTasks.forEach((t, idx) => {
        const task = t as unknown as Task;
        console.log(`[SEED] Preparing task #${idx + 1} - ID: ${task.id}`);

        const docRef = doc(collection(db, 'tasks'), task.id);

        const taskForFirestore = {
          ...task,
          createdAt: typeof task.createdAt === 'string'
            ? new Date(task.createdAt)
            : (task.createdAt as Date),
          dueDate: task.dueDate
            ? typeof task.dueDate === 'string'
              ? new Date(task.dueDate)
              : (task.dueDate as Date)
            : undefined,
        } as Omit<Task, 'id'>;

        console.log(`[SEED] Task ready: ${task.id}, createdAt=${taskForFirestore.createdAt}, dueDate=${taskForFirestore.dueDate}`);
        tasksBatch.set(docRef, taskForFirestore);
      });
      await tasksBatch.commit();
      console.log('[SEED] Seeded tasks.');

      console.log('=== [SEED] Database seeded successfully ===');
      return { success: true, message: 'Database seeded successfully!' };
    } catch (error) {
      console.error('=== [SEED ERROR] ===');
      console.error(error);
      if (error instanceof Error) {
        return { success: false, message: `Failed: ${error.message}` };
      }
      return { success: false, message: 'Unknown error occurred.' };
    }
  }
);