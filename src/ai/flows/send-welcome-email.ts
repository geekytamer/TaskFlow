
'use server';

/**
 * @fileOverview A flow for sending a welcome email to a new user.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { sendEmail } from './send-email';

const SendWelcomeEmailInputSchema = z.object({
  name: z.string().describe("The new user's name."),
  email: z.string().email().describe("The new user's email address."),
  password: z.string().describe('The randomly generated password for the new user.'),
});

export type SendWelcomeEmailInput = z.infer<typeof SendWelcomeEmailInputSchema>;

export async function sendWelcomeEmail(input: SendWelcomeEmailInput): Promise<void> {
  await sendWelcomeEmailFlow(input);
}

const sendWelcomeEmailFlow = ai.defineFlow(
  {
    name: 'sendWelcomeEmailFlow',
    inputSchema: SendWelcomeEmailInputSchema,
    outputSchema: z.void(),
  },
  async ({ name, email, password }) => {
    console.log(`[Flow] Starting welcome email flow for new user: ${email}`);

    const subject = 'Welcome to TaskFlow!';
    const body = `
      <h1>Welcome to TaskFlow, ${name}!</h1>
      <p>Your account has been created successfully.</p>
      <p>You can now log in to the TaskFlow application using the following credentials:</p>
      <ul>
        <li><strong>Email:</strong> ${email}</li>
        <li><strong>Password:</strong> ${password}</li>
      </ul>
      <p>We recommend that you change your password after your first login.</p>
      <p>Thank you,</p>
      <p>The TaskFlow Team</p>
    `;

    try {
      await sendEmail({
        to: email,
        subject,
        body,
      });
      console.log(`[Flow] Welcome email successfully sent to ${email}`);
    } catch (error) {
      console.error(`[Flow] Failed to send welcome email to ${email}: ${error}`);
      // We re-throw the error so the calling function knows the email failed.
      throw new Error(`Failed to send welcome email: ${error}`);
    }
  }
);
