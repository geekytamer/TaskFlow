export interface Client {
    id: string;
    name: string;
    email: string;
    address: string;
    companyId: string;
}

export type InvoiceStatus = 'Draft' | 'Sent' | 'Paid' | 'Overdue';
export const invoiceStatuses: InvoiceStatus[] = ['Draft', 'Sent', 'Paid', 'Overdue'];


export interface InvoiceLineItem {
    taskId: string;
    description: string; // e.g., Task title or vendor invoice details
    amount: number;
}

export interface Invoice {
    id: string;
    invoiceNumber: string;
    companyId: string;
    clientId: string;
    issueDate: Date;
    dueDate: Date;
    lineItems: InvoiceLineItem[];
    total: number;
    status: InvoiceStatus;
}
