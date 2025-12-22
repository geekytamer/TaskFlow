import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CompanyTable } from './company-table';
import { PositionTable } from './position-table';

export function CompaniesPage() {
  return (
    <div className="flex h-full flex-col">
      <div className="pb-4">
        <h1 className="text-3xl font-bold font-headline">Companies</h1>
        <p className="text-muted-foreground">
          Manage companies, positions, and user assignments.
        </p>
      </div>
      <Tabs defaultValue="companies">
        <TabsList className="mb-4">
          <TabsTrigger value="companies">Companies</TabsTrigger>
          <TabsTrigger value="positions">Positions</TabsTrigger>
        </TabsList>
        <TabsContent value="companies">
          <CompanyTable />
        </TabsContent>
        <TabsContent value="positions">
          <PositionTable />
        </TabsContent>
      </Tabs>
    </div>
  );
}
