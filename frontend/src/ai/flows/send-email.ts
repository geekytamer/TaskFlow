"use server";

/**
 * @fileOverview A flow for sending emails using Resend (recommended modern email API).
 * It replaces Nodemailer for simplicity and better deliverability.
 *
 * - sendEmail - A function that sends an email.
 * - SendEmailInput - The input type for the sendEmail function.
 */

import { ai } from "@/ai/genkit";
import { z } from "zod";
import { Resend } from "resend";

// Initialize Resend client
const resend = new Resend(process.env.RESEND_API_KEY);

// Define schema for inputs
const SendEmailInputSchema = z.object({
  to: z.string().email().describe("The recipient's email address."),
  subject: z.string().describe("The subject line of the email."),
  body: z.string().describe("The HTML body of the email."),
});

export type SendEmailInput = z.infer<typeof SendEmailInputSchema>;

/**
 * Direct call function — can be used manually if needed
 */
export async function sendEmail(
  input: SendEmailInput
): Promise<{ success: boolean; error?: string }> {
  return sendEmailFlow(input);
}

/**
 * Main Genkit flow definition for sending email.
 */
const sendEmailFlow = ai.defineFlow(
  {
    name: "sendEmailFlow",
    inputSchema: SendEmailInputSchema,
    outputSchema: z.object({
      success: z.boolean(),
      error: z.string().optional(),
    }),
  },
  async (input) => {
    if (!process.env.RESEND_API_KEY) {
      const errorMessage =
        "RESEND_API_KEY is not configured. Cannot send email.";
      console.error(errorMessage);
      return { success: false, error: errorMessage };
    }

    try {
      const result = await resend.emails.send({
        from: "Tasks - AL-Yarubi Group <no-reply@alyarubi-group.com>", // Use your verified domain email here
        to: input.to,
        subject: input.subject,
        html: input.body,
      });

      if (result.error) {
        console.error("Resend API error:", result.error);
        return {
          success: false,
          error: result.error.message || "Unknown Resend error",
        };
      }

      console.log(`Email sent successfully to ${input.to}.`);
      return { success: true };
    } catch (error) {
      const errorMessage = `Failed to send email via Resend: ${
        error instanceof Error ? error.message : String(error)
      }`;
      console.error(errorMessage);
      return { success: false, error: errorMessage };
    }
  }
);
