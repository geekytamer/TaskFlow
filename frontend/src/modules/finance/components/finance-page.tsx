import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ClientTable } from './client-table';
import { InvoiceTable } from './invoice-table';

export function FinancePage() {
  return (
    <div className="flex h-full flex-col">
      <div className="pb-4">
        <h1 className="text-3xl font-bold font-headline">Finance</h1>
        <p className="text-muted-foreground">
          Manage clients, create invoices, and track payments.
        </p>
      </div>
      <Tabs defaultValue="invoices">
        <TabsList className="mb-4">
          <TabsTrigger value="invoices">Invoices</TabsTrigger>
          <TabsTrigger value="clients">Clients</TabsTrigger>
        </TabsList>
        <TabsContent value="invoices">
          <InvoiceTable />
        </TabsContent>
        <TabsContent value="clients">
          <ClientTable />
        </TabsContent>
      </Tabs>
    </div>
  );
}
