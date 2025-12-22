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
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Globe, Lock, Trash2, UserPlus, UserMinus, Pencil } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { getUsersByCompany } from '@/services/userService';
import { getClients } from '@/services/financeService';
import type { Client, ProjectVisibility } from '@/lib/types';

export default function ProjectDetailsPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const { selectedCompany, currentUser } = useCompany();
  const [project, setProject] = React.useState<Project | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [users, setUsers] = React.useState<User[]>([]);
  const [clients, setClients] = React.useState<Client[]>([]);
  const [editName, setEditName] = React.useState('');
  const [editDescription, setEditDescription] = React.useState('');
  const [editVisibility, setEditVisibility] = React.useState<ProjectVisibility>('Public');
  const [editClient, setEditClient] = React.useState<string | undefined>();
  const [selectedMemberToAdd, setSelectedMemberToAdd] = React.useState<string | undefined>();
  const [editOpen, setEditOpen] = React.useState(false);
  const { toast } = useToast();

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

      const canView = projectData.visibility === 'Public' || projectData.memberIds?.includes(currentUser.id) || currentUser.role === 'Admin';

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

      const [companyUsers, clientData] = await Promise.all([
        getUsersByCompany(selectedCompany.id),
        getClients(selectedCompany.id),
      ]);
      setUsers(companyUsers);
      setClients(clientData);
      setLoading(false);
    }

    fetchData();
  }, [id, selectedCompany, router, currentUser]);

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
  const isManager = currentUser && ['Admin', 'Manager'].includes(currentUser.role);

  return (
    <div className="flex h-full flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold font-headline">{project.name}</h1>
            <Badge variant={project.visibility === 'Private' ? 'secondary' : 'outline'}>
              {project.visibility === 'Private' ? <Lock className="mr-1 h-3 w-3" /> : <Globe className="mr-1 h-3 w-3" />}
              {project.visibility}
            </Badge>
          </div>
          <p className="text-muted-foreground">{project.description}</p>
        </div>
        <div className="flex gap-2">
          {isManager && (
            <>
              <Sheet open={editOpen} onOpenChange={setEditOpen}>
                <SheetTrigger asChild>
                  <Button variant="outline">
                    <Pencil className="h-4 w-4 mr-1" />
                    Edit Project
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
                        <SelectTrigger>
                          <SelectValue placeholder="Visibility" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Public">Public</SelectItem>
                          <SelectItem value="Private">Private</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Client</Label>
                      <Select
                        value={editClient ?? 'none'}
                        onValueChange={(v) => setEditClient(v)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Client (optional)" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No client</SelectItem>
                          {clients.map((client) => (
                            <SelectItem key={client.id} value={client.id}>
                              {client.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label className="text-base font-semibold">Members</Label>
                        <div className="flex gap-2">
                          <Select value={selectedMemberToAdd} onValueChange={(v) => setSelectedMemberToAdd(v)}>
                            <SelectTrigger className="w-[180px]">
                              <SelectValue placeholder="Invite member" />
                            </SelectTrigger>
                            <SelectContent>
                              {availableMembers.map((user) => (
                                <SelectItem key={user.id} value={user.id}>
                                  {user.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button variant="outline" onClick={handleAddMember} disabled={!selectedMemberToAdd}>
                            <UserPlus className="h-4 w-4 mr-1" /> Add
                          </Button>
                        </div>
                      </div>
                      <div className="space-y-2">
                        {projectMembers.length === 0 && <p className="text-sm text-muted-foreground">No members yet.</p>}
                        {projectMembers.map((user) => (
                          <div key={user.id} className="flex items-center justify-between rounded border px-3 py-2">
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
                      <Trash2 className="h-4 w-4 mr-1" />
                      Delete Project
                    </Button>
                    <Button onClick={handleSave} disabled={saving}>
                      Save Changes
                    </Button>
                  </SheetFooter>
                </SheetContent>
              </Sheet>
            </>
          )}
          <CreateTaskSheet />
        </div>
      </div>

      <ProjectTaskViews project={project} />
    </div>
  );
}
