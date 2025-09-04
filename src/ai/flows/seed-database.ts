'use server';
/**
 * @fileOverview A Genkit flow for seeding the Firestore database with placeholder data.
 * This flow deletes existing data and populates collections with a fresh set of placeholders.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { db } from '@/lib/firebase';
import { collection, doc, writeBatch, query, getDocs, WriteBatch } from 'firebase/firestore';
import {
  placeholderCompanies,
  placeholderPositions,
  placeholderUsers,
  placeholderProjects,
  placeholderTasks,
} from '@/lib/placeholder-data';
import type { Task } from '@/modules/projects/types';

// Helper function to delete all documents from a collection.
async function deleteCollection(collectionName: string) {
  console.log(`[SEED] Deleting all documents from collection: ${collectionName}`);
  const collectionRef = collection(db, collectionName);
  const q = query(collectionRef);
  const snapshot = await getDocs(q);

  if (snapshot.empty) {
    console.log(`[SEED] Collection '${collectionName}' is already empty.`);
    return;
  }

  let batch = writeBatch(db);
  let count = 0;

  for (const docSnap of snapshot.docs) {
    batch.delete(docSnap.ref);
    count++;
    if (count % 500 === 0) {
      // Commit batch every 500 deletes
      await batch.commit();
      batch = writeBatch(db);
    }
  }

  // Commit the final batch
  if (count % 500 !== 0) {
    await batch.commit();
  }

  console.log(`[SEED] Successfully deleted ${count} documents from ${collectionName}.`);
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
        await deleteCollection(col);
      }
      
      // Special handling for users to keep the admin
      console.log('[SEED] Clearing non-admin users...');
      const usersCollectionRef = collection(db, 'users');
      const usersSnapshot = await getDocs(usersCollectionRef);
      if (!usersSnapshot.empty) {
        const batch = writeBatch(db);
        let deletedCount = 0;
        usersSnapshot.forEach((docSnap) => {
          if (docSnap.data().email !== 'admin@taskflow.com') {
            batch.delete(docSnap.ref);
            deletedCount++;
          }
        });
        if (deletedCount > 0) {
          await batch.commit();
          console.log(`[SEED] Deleted ${deletedCount} non-admin users.`);
        } else {
           console.log('[SEED] No non-admin users to delete.');
        }
      }

      // 2. Seed new data
      const masterBatch = writeBatch(db);

      console.log(`[SEED] Seeding ${placeholderCompanies.length} companies...`);
      placeholderCompanies.forEach((company) => {
        const docRef = doc(collection(db, 'companies'), company.id);
        masterBatch.set(docRef, company);
      });
      
      console.log(`[SEED] Seeding ${placeholderPositions.length} positions...`);
      placeholderPositions.forEach((position) => {
        const docRef = doc(collection(db, 'positions'), position.id);
        masterBatch.set(docRef, position);
      });

      console.log(`[SEED] Seeding ${placeholderUsers.length} non-admin users...`);
      placeholderUsers.forEach((user) => {
         if (user.email === 'admin@taskflow.com') {
             console.log(`[SEED] Skipping placeholder admin user to prevent overwrite.`);
             return;
         }
        const docRef = doc(collection(db, 'users'), user.id);
        masterBatch.set(docRef, user);
      });

      console.log(`[SEED] Seeding ${placeholderProjects.length} projects...`);
      placeholderProjects.forEach((project) => {
        const docRef = doc(collection(db, 'projects'), project.id);
        masterBatch.set(docRef, project);
      });

      console.log(`[SEED] Seeding ${placeholderTasks.length} tasks...`);
      placeholderTasks.forEach((t) => {
        const task = t as unknown as Task;
        const docRef = doc(collection(db, 'tasks'), task.id);
        const taskForFirestore = {
          ...task,
          createdAt: new Date(task.createdAt),
          dueDate: task.dueDate ? new Date(task.dueDate) : undefined,
        } as Omit<Task, 'id' | 'createdAt' | 'dueDate'> & { createdAt: Date, dueDate?: Date };
        masterBatch.set(docRef, taskForFirestore);
      });

      console.log('[SEED] Committing all new data to the database...');
      await masterBatch.commit();
      console.log('=== [SEED] Database seeded successfully ===');
      
      return { success: true, message: 'Database seeded successfully!' };
    } catch (error) {
      console.error('=== [SEED ERROR] ===', error);
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
      return { success: false, message: `Seeding failed: ${errorMessage}` };
    }
  }
);
