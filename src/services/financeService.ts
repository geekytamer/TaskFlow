'use server';

import { db } from '@/lib/firebase';
import type { Client, Invoice } from '@/modules/finance/types';
import { collection, getDocs, addDoc, doc, updateDoc, query, where, Timestamp } from 'firebase/firestore';

const convertTimestamp = (data: any) => {
    const dataWithDates = { ...data };
    for (const key in dataWithDates) {
        if (dataWithDates[key] instanceof Timestamp) {
            dataWithDates[key] = dataWithDates[key].toDate();
        }
    }
    return dataWithDates;
};

// CLIENTS
export async function getClients(companyId: string): Promise<Client[]> {
    try {
        const q = query(collection(db, 'clients'), where('companyId', '==', companyId));
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Client));
    } catch (error) {
        console.error("Error fetching clients: ", error);
        throw new Error("Could not fetch clients.");
    }
}

export async function createClient(clientData: Omit<Client, 'id'>): Promise<Client> {
    try {
        const docRef = await addDoc(collection(db, 'clients'), clientData);
        return { id: docRef.id, ...clientData };
    } catch (error) {
        console.error("Error creating client: ", error);
        throw new Error("Could not create client.");
    }
}

// INVOICES
export async function getInvoices(companyId: string): Promise<Invoice[]> {
    try {
        const q = query(collection(db, 'invoices'), where('companyId', '==', companyId));
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({ id: doc.id, ...convertTimestamp(doc.data()) } as Invoice));
    } catch (error) {
        console.error("Error fetching invoices: ", error);
        throw new Error("Could not fetch invoices.");
    }
}

export async function createInvoice(invoiceData: Omit<Invoice, 'id'>): Promise<Invoice> {
    try {
        const docRef = await addDoc(collection(db, 'invoices'), invoiceData);
        return { id: docRef.id, ...invoiceData };
    } catch (error) {
        console.error("Error creating invoice: ", error);
        throw new Error("Could not create invoice.");
    }
}

export async function updateInvoiceStatus(invoiceId: string, status: Invoice['status']): Promise<void> {
    try {
        const invoiceRef = doc(db, 'invoices', invoiceId);
        await updateDoc(invoiceRef, { status });
    } catch (error) {
        console.error(`Error updating invoice status for ID ${invoiceId}: `, error);
        throw new Error("Could not update invoice status.");
    }
}
