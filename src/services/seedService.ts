
'use server';

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

async function deleteAllDocumentsInCollection(collectionName: string) {
    const collectionRef = collection(db, collectionName);
    const q = query(collectionRef);
    const querySnapshot = await getDocs(q);
    const batch = writeBatch(db);
    querySnapshot.forEach((doc) => {
        batch.delete(doc.ref);
    });
    await batch.commit();
}

export async function seedDatabase() {
  try {
    console.log('Starting database seed...');

    // Clear existing data from all collections except 'users'
    console.log('Clearing existing data...');
    const collectionsToClear = ['companies', 'positions', 'projects', 'tasks', 'comments'];
    for (const collectionName of collectionsToClear) {
        await deleteAllDocumentsInCollection(collectionName);
        console.log(`Cleared ${collectionName} collection.`);
    }

    // We do NOT clear the users collection so we don't delete our admin user.
    // The following writes will overwrite placeholder users but keep the admin.
    const batch = writeBatch(db);

    // Seed companies
    console.log('Seeding companies...');
    placeholderCompanies.forEach((company) => {
      const docRef = doc(db, 'companies', company.id);
      batch.set(docRef, company);
    });
    console.log('Companies added to batch.');

    // Seed positions
    console.log('Seeding positions...');
    placeholderPositions.forEach((position) => {
      const docRef = doc(db, 'positions', position.id);
      batch.set(docRef, position);
    });
    console.log('Positions added to batch.');

    // Seed non-admin users. This will overwrite any existing placeholder users
    // but will not touch the Firebase Auth-created admin user.
    console.log('Seeding non-admin users...');
    placeholderUsers.forEach((user) => {
        // We skip the user that we are using as a template for the admin
        if (user.email === 'alex.j@innovatecorp.com') return;

        const docRef = doc(db, 'users', user.id);
        batch.set(docRef, user);
    });
    console.log('Users added to batch.');

    // Seed projects
    console.log('Seeding projects...');
    placeholderProjects.forEach((project) => {
      const docRef = doc(db, 'projects', project.id);
      batch.set(docRef, project);
    });
    console.log('Projects added to batch.');

    // Seed tasks
    console.log('Seeding tasks...');
    placeholderTasks.forEach((task) => {
      const docRef = doc(db, 'tasks', task.id);
      // Firestore cannot store `undefined`, so we need to construct the object carefully
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
      batch.set(docRef, taskForFirestore);
    });
    console.log('Tasks added to batch.');

    // Commit the batch
    console.log('Committing batch...');
    await batch.commit();
    console.log('Database seeded successfully!');

  } catch (error) {
    console.error('Error seeding database:', error);
    throw new Error('Failed to seed database.');
  }
}
