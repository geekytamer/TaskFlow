'use server';
/**
 * @fileOverview A Genkit flow for seeding the Firestore database with placeholder data.
 * This flow is designed to be run from a trusted environment (like the settings page)
 * and will wipe and re-populate several collections.
 *
 * - seedDatabaseFlow - The main flow function that orchestrates the seeding process.
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

// Helper function to delete all documents in a collection in batches
async function deleteCollection(collectionName: string) {
  const collectionRef = collection(db, collectionName);
  const q = query(collectionRef);
  const querySnapshot = await getDocs(q);
  
  if (querySnapshot.empty) {
      console.log(`Collection ${collectionName} is already empty.`);
      return;
  }

  // Firestore allows a maximum of 500 operations in a single batch.
  const batchSize = 500;
  let i = 0;
  let batch = writeBatch(db);

  for (const doc of querySnapshot.docs) {
      batch.delete(doc.ref);
      i++;
      if (i % batchSize === 0) {
          console.log(`Committing batch delete for ${collectionName}...`);
          await batch.commit();
          batch = writeBatch(db); // start a new batch
      }
  }

  // Commit the final batch if it's not empty
  if (i % batchSize !== 0) {
      await batch.commit();
  }
  
  console.log(`Successfully deleted ${querySnapshot.size} documents from ${collectionName}.`);
}


export const seedDatabaseFlow = ai.defineFlow(
  {
    name: 'seedDatabaseFlow',
    inputSchema: z.void(),
    outputSchema: z.object({ success: z.boolean(), message: z.string() }),
  },
  async () => {
    try {
        console.log('Starting database seed flow...');

        // 1. Clear existing data
        console.log('Clearing existing data...');
        const collectionsToClear = ['companies', 'positions', 'projects', 'tasks', 'comments'];
        for (const collectionName of collectionsToClear) {
            await deleteCollection(collectionName);
        }

        const usersCollectionRef = collection(db, 'users');
        const usersQuery = query(usersCollectionRef);
        const usersSnapshot = await getDocs(usersQuery);
        if (!usersSnapshot.empty) {
            const userDeletionBatch = writeBatch(db);
            usersSnapshot.forEach((doc) => {
                // Safeguard to NOT delete the admin user created via the UI.
                if (doc.data().email !== 'admin@taskflow.com') {
                    userDeletionBatch.delete(doc.ref);
                }
            });
            await userDeletionBatch.commit();
            console.log('Cleared non-admin users.');
        }


        // 2. Seed new data in batches
        const companiesBatch = writeBatch(db);
        placeholderCompanies.forEach((company) => {
          const docRef = doc(db, 'companies', company.id);
          companiesBatch.set(docRef, company);
        });
        await companiesBatch.commit();
        console.log('Seeded companies.');

        const positionsBatch = writeBatch(db);
        placeholderPositions.forEach((position) => {
          const docRef = doc(db, 'positions', position.id);
          positionsBatch.set(docRef, position);
        });
        await positionsBatch.commit();
        console.log('Seeded positions.');

        const usersBatch = writeBatch(db);
        placeholderUsers.forEach((user) => {
            if (user.email === 'admin@taskflow.com') return; 
            const docRef = doc(db, 'users', user.id);
            usersBatch.set(docRef, user);
        });
        await usersBatch.commit();
        console.log('Seeded non-admin users.');
        
        const projectsBatch = writeBatch(db);
        placeholderProjects.forEach((project) => {
          const docRef = doc(db, 'projects', project.id);
          projectsBatch.set(docRef, project);
        });
        await projectsBatch.commit();
        console.log('Seeded projects.');

        const tasksBatch = writeBatch(db);
        placeholderTasks.forEach((task) => {
          const docRef = doc(db, 'tasks', task.id);
          // Firestore handles Date objects directly, so no conversion is needed.
          // The issue was trying to convert a string that was already a Date.
          const taskForFirestore: Omit<Task, 'id' | 'createdAt' | 'dueDate'> & { createdAt: Date, dueDate?: Date } = {
            ...task,
            createdAt: new Date(task.createdAt), // This is correct as it's a string from placeholder
            dueDate: task.dueDate ? new Date(task.dueDate) : undefined, // Also correct
          };
          tasksBatch.set(docRef, taskForFirestore);
        });
        await tasksBatch.commit();
        console.log('Seeded tasks.');

        const successMessage = 'Database seeded successfully!';
        console.log(successMessage);
        return { success: true, message: successMessage };

      } catch (error) {
        console.error('Error seeding database:', error);
        if (error instanceof Error) {
            return { success: false, message: `Failed to seed database: ${error.message}` };
        }
        return { success: false, message: 'An unknown error occurred during seeding.' };
      }
  }
);
