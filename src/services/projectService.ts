
'use server';

import type { Task, Project, Comment } from '@/modules/projects/types';
import { db } from '@/lib/firebase';
import { collection, getDocs, doc, getDoc, addDoc, updateDoc, query, where, Timestamp } from 'firebase/firestore';
import { notifyOnTaskAssignment } from '@/ai/flows/notify-on-task-assignment';
import { getUserById } from './userService';

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
    try {
        const projectsCol = collection(db, 'projects');
        const projectSnapshot = await getDocs(projectsCol);
        const projectList = projectSnapshot.docs.map(doc => ({ id: doc.id, ...convertTimestamp(doc.data()) } as Project));
        return projectList;
    } catch (error) {
        console.error("Error fetching projects: ", error);
        throw new Error("Could not fetch projects from Firestore.");
    }
}

export async function getProjectById(id: string): Promise<Project | undefined> {
    if (!id) return undefined;
    try {
        const projectDoc = await getDoc(doc(db, 'projects', id));
        if (!projectDoc.exists()) {
            return undefined;
        }
        return { id: projectDoc.id, ...convertTimestamp(projectDoc.data()) } as Project;
    } catch (error) {
        console.error(`Error fetching project with ID ${id}: `, error);
        throw new Error("Could not fetch project from Firestore.");
    }
}

export async function createProject(projectData: Omit<Project, 'id'>): Promise<Project> {
    try {
        const docRef = await addDoc(collection(db, 'projects'), projectData);
        return { id: docRef.id, ...projectData };
    } catch (error) {
        console.error("Error creating project: ", error);
        throw new Error("Could not create project in Firestore.");
    }
}

// TASKS
export async function getTasks(): Promise<Task[]> {
     try {
        const tasksCol = collection(db, 'tasks');
        const taskSnapshot = await getDocs(tasksCol);
        const taskList = taskSnapshot.docs.map(doc => ({ id: doc.id, ...convertTimestamp(doc.data()) } as Task));
        return taskList;
    } catch (error) {
        console.error("Error fetching tasks: ", error);
        throw new Error("Could not fetch tasks from Firestore.");
    }
}

export async function getTaskById(id: string): Promise<Task | undefined> {
    if (!id) return undefined;
    try {
        const taskDoc = await getDoc(doc(db, 'tasks', id));
        if (!taskDoc.exists()) {
            return undefined;
        }
        return { id: taskDoc.id, ...convertTimestamp(taskDoc.data()) } as Task;
    } catch (error) {
        console.error(`Error fetching task with ID ${id}: `, error);
        throw new Error("Could not fetch task from Firestore.");
    }
}

export async function createTask(taskData: Omit<Task, 'id' | 'status' | 'createdAt'>): Promise<Task> {
    try {
        const newTaskData = { ...taskData, status: 'To Do' as const, createdAt: new Date() };
        const docRef = await addDoc(collection(db, 'tasks'), newTaskData);
        
        const createdTask = { id: docRef.id, ...newTaskData };

        if (createdTask.assignedUserIds && createdTask.assignedUserIds.length > 0) {
            console.log(`[projectService] Triggering notification for new task ${createdTask.id}`);
            notifyOnTaskAssignment({ taskId: createdTask.id, userIds: createdTask.assignedUserIds })
                .catch(err => console.error(`[projectService] Failed to send notification for new task: ${err}`));
        }

        return createdTask;
    } catch (error) {
        console.error("Error creating task: ", error);
        throw new Error("Could not create task in Firestore.");
    }
}

export async function updateTask(taskId: string, taskData: Partial<Task>): Promise<Task | undefined> {
    try {
        const taskRef = doc(db, 'tasks', taskId);
        const originalTask = await getTaskById(taskId);

        await updateDoc(taskRef, taskData);
        
        const updatedDoc = await getDoc(taskRef);
        if (!updatedDoc.exists()) return undefined;
        const updatedTask = { id: updatedDoc.id, ...convertTimestamp(updatedDoc.data()) } as Task;

        // Check if assignees have changed
        const originalAssignees = new Set(originalTask?.assignedUserIds || []);
        const newAssignees = new Set(updatedTask.assignedUserIds || []);
        const newlyAssignedUserIds = [...newAssignees].filter(id => !originalAssignees.has(id));

        if (newlyAssignedUserIds.length > 0) {
            console.log(`[projectService] Triggering notification for updated task ${updatedTask.id}`);
            notifyOnTaskAssignment({ taskId: updatedTask.id, userIds: newlyAssignedUserIds })
                 .catch(err => console.error(`[projectService] Failed to send notification for updated task: ${err}`));
        }

        return updatedTask;
    } catch (error) {
        console.error(`Error updating task with ID ${taskId}: `, error);
        throw new Error("Could not update task in Firestore.");
    }
}

// COMMENTS
export async function getCommentsByTaskId(taskId: string): Promise<Comment[]> {
    try {
        const commentsQuery = query(collection(db, 'comments'), where('taskId', '==', taskId));
        const commentSnapshot = await getDocs(commentsQuery);
        const commentList = commentSnapshot.docs.map(doc => ({ id: doc.id, ...convertTimestamp(doc.data()) } as Comment));
        return commentList;
    } catch (error) {
        console.error(`Error fetching comments for task ID ${taskId}: `, error);
        throw new Error("Could not fetch comments from Firestore.");
    }
}

export async function createComment(commentData: Omit<Comment, 'id' | 'createdAt'>): Promise<Comment> {
    try {
        const newCommentData = { ...commentData, createdAt: new Date() };
        const docRef = await addDoc(collection(db, 'comments'), newCommentData);
        return { id: docRef.id, ...newCommentData };
    } catch (error) {
        console.error("Error creating comment: ", error);
        throw new Error("Could not create comment in Firestore.");
    }
}
