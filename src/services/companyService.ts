'use server';

import type { Company, Position } from '@/modules/companies/types';
import { db } from '@/lib/firebase';
import { collection, getDocs, doc, getDoc, query, where } from 'firebase/firestore';

export async function getCompanies(): Promise<Company[]> {
  try {
    const companiesCol = collection(db, 'companies');
    const companySnapshot = await getDocs(companiesCol);
    const companyList = companySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Company));
    return companyList;
  } catch (error) {
    console.error("Error fetching companies: ", error);
    throw new Error("Could not fetch companies from Firestore.");
  }
}

export async function getCompanyById(id: string): Promise<Company | undefined> {
   if (!id) return undefined;
  try {
    const companyDoc = await getDoc(doc(db, 'companies', id));
    if (!companyDoc.exists()) {
      return undefined;
    }
    return { id: companyDoc.id, ...companyDoc.data() } as Company;
  } catch (error) {
    console.error(`Error fetching company with ID ${id}: `, error);
    throw new Error("Could not fetch company from Firestore.");
  }
}

export async function getPositions(): Promise<Position[]> {
  try {
    const positionsCol = collection(db, 'positions');
    const positionSnapshot = await getDocs(positionsCol);
    const positionList = positionSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Position));
    return positionList;
  } catch (error) {
    console.error("Error fetching positions: ", error);
    throw new Error("Could not fetch positions from Firestore.");
  }
}

export async function getPositionById(id: string): Promise<Position | undefined> {
    if (!id) return undefined;
    try {
        const positionDoc = await getDoc(doc(db, 'positions', id));
        if (!positionDoc.exists()) {
            return undefined;
        }
        return { id: positionDoc.id, ...positionDoc.data() } as Position;
    } catch (error) {
        console.error(`Error fetching position with ID ${id}: `, error);
        throw new Error("Could not fetch position from Firestore.");
    }
}
