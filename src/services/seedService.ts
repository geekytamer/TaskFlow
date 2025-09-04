
'use server';

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

// Helper function to delete all documents in a collection in batches
async function deleteCollection(collectionName: string) {
    const collectionRef = collection(db, collectionName);
    const q = query(collectionRef);
    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.empty) {
        console.log(`Collection ${collectionName} is already empty.`);
        return;
    }

    const batch = writeBatch(db);
    querySnapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
    });
    
    await batch.commit();
    console.log(`Successfully deleted ${querySnapshot.size} documents from ${collectionName}.`);
}


export async function seedDatabase() {
  try {
    console.log('Starting database seed...');

    // 1. Clear existing data from all relevant collections
    console.log('Clearing existing data...');
    const collectionsToClear = ['companies', 'positions', 'projects', 'tasks', 'comments'];
    for (const collectionName of collectionsToClear) {
        await deleteCollection(collectionName);
    }
     // We also need to clear non-admin users from the users collection
    const usersCollectionRef = collection(db, 'users');
    const usersQuery = query(usersCollectionRef);
    const usersSnapshot = await getDocs(usersQuery);
    const userDeletionBatch = writeBatch(db);
    usersSnapshot.forEach((doc) => {
        // This is a safeguard to NOT delete the currently authenticated user, who should be the admin.
        // In a real scenario, you might have more robust checks, but this prevents wiping the admin.
        if (doc.data().role !== 'Admin') {
            userDeletionBatch.delete(doc.ref);
        }
    });
    await userDeletionBatch.commit();
    console.log('Cleared non-admin users.');


    // 2. Seed data in separate batches for each data type
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

    // Seed non-admin users. This will overwrite any existing placeholder users
    // but will not touch the Firebase Auth-created admin user.
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
      const taskForFirestore: Partial<Task> = { ...task };
      if (task.dueDate) {
        taskForFirestore.dueDate = new Date(task.dueDate);
      } else {
        delete taskForFirestore.dueDate;
      }
      if (task.createdAt) {
          taskForFirestore.createdAt = new Date(task.createdAt);
      } else {
          taskForFirestore.createdAt = new Date();
      }
      tasksBatch.set(docRef, taskForFirestore);
    });
    await tasksBatch.commit();
    console.log('Seeded tasks.');

    console.log('Database seeded successfully!');

  } catch (error) {
    console.error('Error seeding database:', error);
    throw new Error('Failed to seed database.');
  }
}
