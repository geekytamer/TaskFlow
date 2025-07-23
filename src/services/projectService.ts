'use server';

import type { Task, Project, Comment, TaskStatus, TaskPriority } from '@/modules/projects/types';
import { db } from '@/lib/firebase';
import { collection, getDocs, doc, getDoc, addDoc, updateDoc, query, where, Timestamp } from 'firebase/firestore';

const convertTimestamp = (data: any) => {
    const dataWithDates = { ...data };
    for (const key in dataWithDates) {
        if (dataWithDates[key] instanceof Timestamp) {
            dataWithDates[key] = dataWithDates[key].toDate();
        }
    }
    return dataWithDates;
};

// PROJECTS
export async function getProjects(): Promise<Project[]> {
    const projectsCol = collection(db, 'projects');
    const projectSnapshot = await getDocs(projectsCol);
    const projectList = projectSnapshot.docs.map(doc => ({ id: doc.id, ...convertTimestamp(doc.data()) } as Project));
    return projectList;
}

export async function getProjectById(id: string): Promise<Project | undefined> {
    if (!id) return undefined;
    const projectDoc = await getDoc(doc(db, 'projects', id));
    if (!projectDoc.exists()) {
        return undefined;
    }
    return { id: projectDoc.id, ...convertTimestamp(projectDoc.data()) } as Project;
}

export async function createProject(projectData: Omit<Project, 'id'>): Promise<Project> {
    const docRef = await addDoc(collection(db, 'projects'), projectData);
    return { id: docRef.id, ...projectData };
}

// TASKS
export async function getTasks(): Promise<Task[]> {
    const tasksCol = collection(db, 'tasks');
    const taskSnapshot = await getDocs(tasksCol);
    const taskList = taskSnapshot.docs.map(doc => ({ id: doc.id, ...convertTimestamp(doc.data()) } as Task));
    return taskList;
}

export async function getTaskById(id: string): Promise<Task | undefined> {
    if (!id) return undefined;
    const taskDoc = await getDoc(doc(db, 'tasks', id));
    if (!taskDoc.exists()) {
        return undefined;
    }
    return { id: taskDoc.id, ...convertTimestamp(taskDoc.data()) } as Task;
}

export async function createTask(taskData: Omit<Task, 'id' | 'status'>): Promise<Task> {
    const newTaskData = { ...taskData, status: 'To Do' };
    const docRef = await addDoc(collection(db, 'tasks'), newTaskData);
    return { id: docRef.id, status: 'To Do', ...taskData };
}

export async function updateTask(taskId: string, taskData: Partial<Task>): Promise<Task | undefined> {
    const taskRef = doc(db, 'tasks', taskId);
    await updateDoc(taskRef, taskData);
    const updatedDoc = await getDoc(taskRef);
    if (!updatedDoc.exists()) return undefined;
    return { id: updatedDoc.id, ...convertTimestamp(updatedDoc.data()) } as Task;
}

// COMMENTS
export async function getCommentsByTaskId(taskId: string): Promise<Comment[]> {
    const commentsQuery = query(collection(db, 'comments'), where('taskId', '==', taskId));
    const commentSnapshot = await getDocs(commentsQuery);
    const commentList = commentSnapshot.docs.map(doc => ({ id: doc.id, ...convertTimestamp(doc.data()) } as Comment));
    return commentList;
}

export async function createComment(commentData: Omit<Comment, 'id' | 'createdAt'>): Promise<Comment> {
    const newCommentData = { ...commentData, createdAt: new Date() };
    const docRef = await addDoc(collection(db, 'comments'), newCommentData);
    return { id: docRef.id, ...newCommentData };
}
