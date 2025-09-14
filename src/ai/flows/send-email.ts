'use server';

/**
 * @fileOverview A flow for sending emails using Nodemailer.
 * It reads SMTP configuration from environment variables.
 *
 * - sendEmail - A function that sends an email.
 * - SendEmailInput - The input type for the sendEmail function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import * as nodemailer from 'nodemailer';

const SendEmailInputSchema = z.object({
  to: z.string().email().describe("The recipient's email address."),
  subject: z.string().describe('The subject line of the email.'),
  body: z.string().describe('The HTML body of the email.'),
});

export type SendEmailInput = z.infer<typeof SendEmailInputSchema>;

export async function sendEmail(input: SendEmailInput): Promise<{ success: boolean; error?: string }> {
  return sendEmailFlow(input);
}

const sendEmailFlow = ai.defineFlow(
  {
    name: 'sendEmailFlow',
    inputSchema: SendEmailInputSchema,
    outputSchema: z.object({ success: z.boolean(), error: z.string().optional() }),
  },
  async (input) => {
    const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;

    if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) {
      const errorMessage = 'SMTP environment variables are not configured. Cannot send email.';
      console.error(errorMessage);
      return { success: false, error: errorMessage };
    }

    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: parseInt(SMTP_PORT, 10),
      secure: parseInt(SMTP_PORT, 10) === 465, // true for 465, false for other ports
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS,
      },
    });

    try {
      await transporter.verify();
      console.log('Nodemailer transporter is ready to send emails.');
    } catch (error) {
       const errorMessage = `Nodemailer transporter verification failed: ${error instanceof Error ? error.message : String(error)}`;
       console.error(errorMessage);
       return { success: false, error: errorMessage };
    }

    try {
      const info = await transporter.sendMail({
        from: `"TaskFlow" <${SMTP_USER}>`,
        to: input.to,
        subject: input.subject,
        html: input.body,
      });

      console.log(`Email sent successfully to ${input.to}. Message ID: ${info.messageId}`);
      return { success: true };
    } catch (error) {
      const errorMessage = `Failed to send email: ${error instanceof Error ? error.message : String(error)}`;
      console.error(errorMessage);
      return { success: false, error: errorMessage };
    }
  }
);
