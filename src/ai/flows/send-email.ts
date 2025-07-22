'use server';

/**
 * @fileOverview A flow for sending emails. In a real application, this would integrate
 * with an email service provider like SendGrid or Postmark.
 *
 * - sendEmail - A function that simulates sending an email.
 * - SendEmailInput - The input type for the sendEmail function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const SendEmailInputSchema = z.object({
  to: z.string().email().describe('The recipient\'s email address.'),
  subject: z.string().describe('The subject line of the email.'),
  body: z.string().describe('The HTML body of the email.'),
});

export type SendEmailInput = z.infer<typeof SendEmailInputSchema>;

export async function sendEmail(input: SendEmailInput): Promise<{ success: boolean }> {
  return sendEmailFlow(input);
}

const sendEmailFlow = ai.defineFlow(
  {
    name: 'sendEmailFlow',
    inputSchema: SendEmailInputSchema,
    outputSchema: z.object({ success: z.boolean() }),
  },
  async (input) => {
    console.log('--- SIMULATING EMAIL ---');
    console.log(`To: ${input.to}`);
    console.log(`Subject: ${input.subject}`);
    console.log('Body:');
    console.log(input.body);
    console.log('------------------------');

    // In a real application, you would integrate with an email service here.
    // For example, using Nodemailer, SendGrid, AWS SES, etc.
    // const transport = nodemailer.createTransport(...);
    // await transport.sendMail(...);
    
    // For this example, we'll just simulate a successful email send.
    // We are not using an AI model here, just using a flow for encapsulation.
    return { success: true };
  }
);
