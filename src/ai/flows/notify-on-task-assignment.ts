'use server';

/**
 * @fileOverview A flow to notify users when they are assigned to a new task.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { sendEmail } from './send-email';
import { getTaskById } from '@/services/projectService';
import { getUserById } from '@/services/userService';

const NotifyOnTaskAssignmentInputSchema = z.object({
  taskId: z.string().describe('The ID of the task that was assigned.'),
  userIds: z.array(z.string()).describe('The IDs of the users who were assigned.'),
});

export type NotifyOnTaskAssignmentInput = z.infer<typeof NotifyOnTaskAssignmentInputSchema>;

export async function notifyOnTaskAssignment(input: NotifyOnTaskAssignmentInput): Promise<void> {
  await notifyOnTaskAssignmentFlow(input);
}

const notifyOnTaskAssignmentFlow = ai.defineFlow(
  {
    name: 'notifyOnTaskAssignmentFlow',
    inputSchema: NotifyOnTaskAssignmentInputSchema,
    outputSchema: z.void(),
  },
  async ({ taskId, userIds }) => {
    console.log(`[Flow] Starting notification flow for task: ${taskId} and users: ${userIds.join(', ')}`);

    const task = await getTaskById(taskId);
    if (!task) {
      console.error(`[Flow] Task with ID ${taskId} not found. Aborting notification.`);
      return;
    }

    for (const userId of userIds) {
      const user = await getUserById(userId);
      if (!user) {
        console.warn(`[Flow] User with ID ${userId} not found. Skipping notification.`);
        continue;
      }

      const subject = `You've been assigned a new task: "${task.title}"`;
      const body = `
        <h1>New Task Assignment</h1>
        <p>Hi ${user.name},</p>
        <p>You have been assigned to a new task:</p>
        <p><b>Task:</b> ${task.title}</p>
        <p><b>Description:</b> ${task.description || 'No description provided.'}</p>
        <p><b>Priority:</b> ${task.priority}</p>
        <p>You can view the task in the TaskFlow application.</p>
        <br>
        <p>Thank you,</p>
        <p>The TaskFlow Team</p>
      `;

      try {
        console.log(`[Flow] Sending email to ${user.email} for task ${taskId}`);
        await sendEmail({
          to: user.email,
          subject,
          body,
        });
      } catch (error) {
        console.error(`[Flow] Failed to send email to ${user.email}: ${error}`);
      }
    }
    console.log(`[Flow] Finished notification flow for task: ${taskId}`);
  }
);
