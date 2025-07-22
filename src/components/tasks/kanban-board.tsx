'use client';

import * as React from 'react';
import {
  placeholderTasks,
  placeholderUsers,
} from '@/lib/placeholder-data';
import type { Task, TaskStatus, User } from '@/lib/lib/types';
import { TaskCard } from './task-card';
import { taskStatuses } from '@/lib/types';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';

export function KanbanBoard() {
  const [tasks, setTasks] = React.useState<Task[]>(placeholderTasks);
  const [users, setUsers] = React.useState<User[]>(placeholderUsers);

  const getTasksByStatus = (status: TaskStatus) =>
    tasks.filter((task) => task.status === status);

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="flex items-center gap-4">
        <Select>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {taskStatuses.map((status) => (
              <SelectItem key={status} value={status}>
                {status}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter by assignee" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Assignees</SelectItem>
            {users.map((user) => (
              <SelectItem key={user.id} value={user.id}>
                {user.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
        {taskStatuses.map((status) => (
          <div
            key={status}
            className="rounded-lg bg-muted/50 h-full flex flex-col"
          >
            <div className="p-4 border-b">
              <h3 className="font-semibold text-lg">{status}</h3>
              <p className="text-sm text-muted-foreground">
                {getTasksByStatus(status).length} tasks
              </p>
            </div>
            <div className="flex flex-col gap-4 p-4 flex-1 overflow-y-auto">
              {getTasksByStatus(status).length > 0 ? (
                getTasksByStatus(status).map((task) => (
                  <TaskCard key={task.id} task={task} users={users} />
                ))
              ) : (
                <div className="text-center text-muted-foreground py-8">
                  No tasks here.
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
