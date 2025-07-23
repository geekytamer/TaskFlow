
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

    // Clear existing data
    console.log('Clearing existing data...');
    const collectionsToClear = ['companies', 'positions', 'users', 'projects', 'tasks', 'comments'];
    for (const collectionName of collectionsToClear) {
        await deleteAllDocumentsInCollection(collectionName);
        console.log(`Cleared ${collectionName} collection.`);
    }

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

    // Seed users
    console.log('Seeding users...');
    placeholderUsers.forEach((user) => {
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
      const taskForFirestore = {
        ...task,
        // Convert string date to Firestore Timestamp object if it exists
        dueDate: task.dueDate ? new Date(task.dueDate) : undefined,
      };
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
