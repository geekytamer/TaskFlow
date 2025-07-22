import { KanbanBoard } from '@/components/tasks/kanban-board';
import { CreateTaskSheet } from '@/components/tasks/create-task-sheet';

export default function TasksPage() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between pb-4">
        <div>
          <h1 className="text-3xl font-bold font-headline">Task Board</h1>
          <p className="text-muted-foreground">
            Manage your team's tasks in one place.
          </p>
        </div>
        <CreateTaskSheet />
      </div>
      <KanbanBoard />
    </div>
  );
}
