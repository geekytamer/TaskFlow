'use client';

import * as React from 'react';
import { notFound, useParams, useRouter } from 'next/navigation';
import { addProjectMember, deleteProject, getProjectById, removeProjectMember, updateProject } from '@/services/projectService';
import type { Project, User } from '@/lib/types';
import { useCompany } from '@/context/company-context';
import { ProjectTaskViews } from '@/modules/projects/components/project-task-views';
import { CreateTaskSheet } from '@/modules/projects/components/create-task-sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { Globe, Lock, Trash2, UserPlus, UserMinus, Pencil } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { getUsersByCompany } from '@/services/userService';
import { getClients, getInvoices } from '@/services/financeService';
import { getTasks } from '@/services/projectService';
import type { Client, Invoice, ProjectVisibility, Task } from '@/lib/types';
import { format } from 'date-fns';
import { canManageProjects, canViewProject } from '@/modules/projects/lib/access';
import { RecordSupportPanel } from '@/modules/shared/components/record-support-panel';
import { useCompanyCurrency } from '@/lib/currency';

export default function ProjectDetailsPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const { selectedCompany, currentUser, currentRole } = useCompany();
  const [project, setProject] = React.useState<Project | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [users, setUsers] = React.useState<User[]>([]);
  const [clients, setClients] = React.useState<Client[]>([]);
  const [tasks, setTasks] = React.useState<Task[]>([]);
  const [invoices, setInvoices] = React.useState<Invoice[]>([]);
  const [editName, setEditName] = React.useState('');
  const [editDescription, setEditDescription] = React.useState('');
  const [editVisibility, setEditVisibility] = React.useState<ProjectVisibility>('Public');
  const [editClient, setEditClient] = React.useState<string | undefined>();
  const [selectedMemberToAdd, setSelectedMemberToAdd] = React.useState<string | undefined>();
  const [editOpen, setEditOpen] = React.useState(false);
  const [financeOpen, setFinanceOpen] = React.useState(false);
  const { toast } = useToast();
  const { money, amount } = useCompanyCurrency();

  React.useEffect(() => {
    async function fetchData() {
      if (!id || !selectedCompany || !currentUser) return;
      
      setLoading(true);
      const projectData = await getProjectById(id);
      
      if (!projectData || projectData.companyId !== selectedCompany.id) {
        // Project doesn't exist or doesn't belong to the selected company
        router.push('/projects');
        return;
      }

      const canView = canViewProject(projectData, currentUser.id, currentRole);

      if (!canView) {
        // User doesn't have permission to view this private project
        router.push('/projects');
        return;
      }
      
      setProject(projectData);
      setEditName(projectData.name);
      setEditDescription(projectData.description || '');
      setEditVisibility(projectData.visibility);
      setEditClient(projectData.clientId);

      const canLoadCompanyReferences = currentRole && currentRole !== 'Employee';
      const [companyUsers, clientData, taskData, invoiceData] = await Promise.all([
        canLoadCompanyReferences ? getUsersByCompany(selectedCompany.id) : Promise.resolve([]),
        canLoadCompanyReferences ? getClients(selectedCompany.id) : Promise.resolve([]),
        getTasks(),
        canLoadCompanyReferences ? getInvoices(selectedCompany.id) : Promise.resolve([]),
      ]);
      setUsers(companyUsers);
      setClients(clientData);
      setTasks(taskData.filter((task) => task.companyId === selectedCompany.id));
      setInvoices(invoiceData);
      setLoading(false);
    }

    fetchData();
  }, [id, selectedCompany, router, currentUser, currentRole]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-4 w-3/4" />
      </div>
    );
  }

  if (!project) {
    // This case handles when the project is not found or user is redirected.
    return null;
  }

  const handleSave = async () => {
    if (!project) return;
    setSaving(true);
    try {
      const updated = await updateProject(project.id, {
        name: editName,
        description: editDescription,
        visibility: editVisibility,
        clientId: editClient && editClient !== 'none' ? editClient : undefined,
      });
      setProject(updated);
      toast({ title: 'Project updated' });
      setEditOpen(false);
    } catch (error) {
      toast({ variant: 'destructive', title: 'Update failed', description: 'Could not update project.' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!project) return;
    if (!confirm('Delete this project and its tasks?')) return;
    setDeleting(true);
    try {
      await deleteProject(project.id);
      toast({ title: 'Project deleted' });
      router.push('/projects');
    } catch (error) {
      toast({ variant: 'destructive', title: 'Delete failed', description: 'Could not delete project.' });
    } finally {
      setDeleting(false);
    }
  };

  const handleAddMember = async () => {
    if (!project || !selectedMemberToAdd) return;
    try {
      const updated = await addProjectMember(project.id, selectedMemberToAdd);
      setProject(updated);
      setSelectedMemberToAdd(undefined);
      toast({ title: 'Member added' });
    } catch {
      toast({ variant: 'destructive', title: 'Failed', description: 'Could not add member.' });
    }
  };

  const handleRemoveMember = async (userId: string) => {
    if (!project) return;
    try {
      const updated = await removeProjectMember(project.id, userId);
      setProject(updated);
      toast({ title: 'Member removed' });
    } catch {
      toast({ variant: 'destructive', title: 'Failed', description: 'Could not remove member.' });
    }
  };

  const projectMembers = (project?.memberIds || []).map((id) => users.find((u) => u.id === id)).filter(Boolean) as User[];
  const availableMembers = users.filter((u) => !(project?.memberIds || []).includes(u.id));
  const isManager = canManageProjects(currentRole);
  const clientName = clients.find((client) => client.id === project.clientId)?.name;
  const projectTasks = tasks.filter((task) => task.projectId === project.id);
  const projectTaskIds = new Set(projectTasks.map((task) => task.id));
  const readyToBillTasks = projectTasks.filter(
    (task) => task.status === 'Done' && (task.invoiceAmount || 0) > 0 && !task.generatedInvoiceId,
  );
  const billedTasks = projectTasks.filter((task) => Boolean(task.generatedInvoiceId));
  const projectInvoices = invoices.filter((invoice) =>
    invoice.lineItems.some((item) => item.taskId && projectTaskIds.has(item.taskId)),
  );
  const billedAmount = projectInvoices.reduce((sum, invoice) => sum + invoice.total, 0);
  const collectedAmount = projectInvoices.reduce((sum, invoice) => sum + (invoice.paidAmount || 0), 0);
  const outstandingAmount = projectInvoices.reduce(
    (sum, invoice) => sum + (invoice.outstandingAmount || 0),
    0,
  );
  const readyToBillAmount = readyToBillTasks.reduce(
    (sum, task) => sum + (task.invoiceAmount || 0),
    0,
  );

  return (
    <div className="flex h-full flex-col gap-6">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold font-headline">{project.name}</h1>
            <Badge variant={project.visibility === 'Private' ? 'secondary' : 'outline'}>
              {project.visibility === 'Private' ? <Lock className="me-1 h-3 w-3" /> : <Globe className="me-1 h-3 w-3" />}
              {project.visibility}
            </Badge>
          </div>
          {project.description && <p className="mt-1 text-muted-foreground">{project.description}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{projectTasks.length} tasks</span>
            {clientName && <><span>•</span><span>{clientName}</span></>}
            {projectMembers.length > 0 && (
              <><span>•</span><span>{projectMembers.length} member{projectMembers.length !== 1 ? 's' : ''}</span></>
            )}
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          {isManager && (
            <Sheet open={editOpen} onOpenChange={setEditOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="sm">
                  <Pencil className="h-4 w-4 me-1" /> Edit
                </Button>
              </SheetTrigger>
              <SheetContent className="w-full max-w-xl">
                <SheetHeader>
                  <SheetTitle>Edit Project</SheetTitle>
                  <SheetDescription>Update details, visibility, client, and members.</SheetDescription>
                </SheetHeader>
                <div className="flex flex-col gap-4 py-4">
                  <div className="space-y-2">
                    <Label>Name</Label>
                    <Input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Name" />
                  </div>
                  <div className="space-y-2">
                    <Label>Description</Label>
                    <Textarea value={editDescription} onChange={(e) => setEditDescription(e.target.value)} placeholder="Description" />
                  </div>
                  <div className="space-y-2">
                    <Label>Visibility</Label>
                    <Select value={editVisibility} onValueChange={(v) => setEditVisibility(v as ProjectVisibility)}>
                      <SelectTrigger><SelectValue placeholder="Visibility" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Public">Public</SelectItem>
                        <SelectItem value="Private">Private</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Client</Label>
                    <Select value={editClient ?? 'none'} onValueChange={(v) => setEditClient(v)}>
                      <SelectTrigger><SelectValue placeholder="Client (optional)" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No client</SelectItem>
                        {clients.map((client) => (
                          <SelectItem key={client.id} value={client.id}>{client.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-base font-semibold">Members</Label>
                      <div className="flex gap-2">
                        <Select value={selectedMemberToAdd} onValueChange={(v) => setSelectedMemberToAdd(v)}>
                          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Invite member" /></SelectTrigger>
                          <SelectContent>
                            {availableMembers.map((user) => (
                              <SelectItem key={user.id} value={user.id}>{user.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button variant="outline" onClick={handleAddMember} disabled={!selectedMemberToAdd}>
                          <UserPlus className="h-4 w-4 me-1" /> Add
                        </Button>
                      </div>
                    </div>
                    <div className="space-y-2">
                      {projectMembers.length === 0 && <p className="text-sm text-muted-foreground">No members yet.</p>}
                      {projectMembers.map((user) => (
                        <div key={user.id} className="flex items-center justify-between rounded border px-3 py-2 bg-card">
                          <div className="flex items-center gap-2">
                            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: project.color || '#999' }} />
                            <span>{user.name}</span>
                          </div>
                          <Button variant="ghost" size="sm" onClick={() => handleRemoveMember(user.id)}>
                            <UserMinus className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                <SheetFooter className="flex justify-between gap-2">
                  <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
                    <Trash2 className="h-4 w-4 me-1" /> Delete Project
                  </Button>
                  <Button onClick={handleSave} disabled={saving}>Save Changes</Button>
                </SheetFooter>
              </SheetContent>
            </Sheet>
          )}
          <CreateTaskSheet lockedProjectId={project.id} />
        </div>
      </div>

      {/* ── Tasks — PRIMARY CONTENT ────────────────────────────────────── */}
      <ProjectTaskViews project={project} />

      {/* ── Finance summary ────────────────────────────────────────────── */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <button
          className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-muted/30 transition-colors"
          onClick={() => setFinanceOpen((v) => !v)}
        >
          <div className="flex items-center gap-4">
            <span className="font-semibold">Finance Summary</span>
            <div className="flex items-center gap-3 text-sm">
              {readyToBillTasks.length > 0 && (
                <span className="rounded-full bg-amber-100 text-amber-700 border border-amber-200 px-2 py-0.5 text-xs font-medium">
                  {readyToBillTasks.length} ready to bill
                </span>
              )}
              <span className="text-muted-foreground">Billed: <span className="font-medium text-foreground">{amount(billedAmount)}</span></span>
              <span className="text-muted-foreground">Collected: <span className="font-medium text-emerald-600">{amount(collectedAmount)}</span></span>
              {outstandingAmount > 0 && (
                <span className="text-muted-foreground">Outstanding: <span className="font-medium text-amber-600">{amount(outstandingAmount)}</span></span>
              )}
            </div>
          </div>
          <span className="text-muted-foreground text-xs">{financeOpen ? '▲ Hide' : '▼ Show'}</span>
        </button>

        {financeOpen && (
          <div className="border-t">
            {/* Stat cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 divide-x border-b">
              {[
                { label: 'Ready to Bill', value: readyToBillTasks.length, sub: amount(readyToBillAmount), color: '' },
                { label: 'Invoiced Tasks', value: billedTasks.length, sub: amount(billedAmount), color: '' },
                { label: 'Collected', value: amount(collectedAmount), sub: null, color: 'text-emerald-600' },
                { label: 'Outstanding', value: amount(outstandingAmount), sub: null, color: 'text-amber-600' },
              ].map(({ label, value, sub, color }) => (
                <div key={label} className="px-5 py-4">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className={`mt-1 text-xl font-bold ${color}`}>{value}</p>
                  {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
                </div>
              ))}
            </div>
            {/* Invoice table */}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Issue Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-end">Total</TableHead>
                  <TableHead className="text-end">Paid</TableHead>
                  <TableHead className="text-end">Outstanding</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {projectInvoices.map((invoice) => (
                  <TableRow key={invoice.id}>
                    <TableCell className="font-medium">{invoice.invoiceNumber}</TableCell>
                    <TableCell>{format(invoice.issueDate, 'MMM d, yyyy')}</TableCell>
                    <TableCell><Badge variant="outline">{invoice.status}</Badge></TableCell>
                    <TableCell className="text-end">{amount(invoice.total)}</TableCell>
                    <TableCell className="text-end">{amount(invoice.paidAmount || 0)}</TableCell>
                    <TableCell className="text-end">{amount(invoice.outstandingAmount || 0)}</TableCell>
                  </TableRow>
                ))}
                {projectInvoices.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="h-16 text-center text-sm text-muted-foreground">
                      No invoices linked to this project yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* ── Attachments & Timeline ─────────────────────────────────────── */}
      {selectedCompany && (
        <RecordSupportPanel
          companyId={selectedCompany.id}
          entityType="project"
          entityId={project.id}
          title="Project Attachments & Timeline"
        />
      )}
    </div>
  );
}
