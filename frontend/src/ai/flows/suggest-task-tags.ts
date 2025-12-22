'use server';

/**
 * @fileOverview Suggests relevant tags for a given task description using an AI model.
 *
 * - suggestTaskTags - A function that takes a task description and returns suggested tags.
 * - SuggestTaskTagsInput - The input type for the suggestTaskTags function.
 * - SuggestTaskTagsOutput - The return type for the suggestTaskTags function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const SuggestTaskTagsInputSchema = z.object({
  taskDescription: z
    .string() // Changed from title to description
    .describe('The description of the task for which tags are to be suggested.'),
});
export type SuggestTaskTagsInput = z.infer<typeof SuggestTaskTagsInputSchema>;

const SuggestTaskTagsOutputSchema = z.object({
  tags: z
    .array(z.string())
    .describe('An array of suggested tags for the task.'),
});
export type SuggestTaskTagsOutput = z.infer<typeof SuggestTaskTagsOutputSchema>;

export async function suggestTaskTags(input: SuggestTaskTagsInput): Promise<SuggestTaskTagsOutput> {
  return suggestTaskTagsFlow(input);
}

const prompt = ai.definePrompt({
  name: 'suggestTaskTagsPrompt',
  input: {schema: SuggestTaskTagsInputSchema},
  output: {schema: SuggestTaskTagsOutputSchema},
  prompt: `Suggest relevant tags for the following task description.  Return only the tags themselves, as a JSON array of strings.\n\nTask Description: {{{taskDescription}}}`,
});

const suggestTaskTagsFlow = ai.defineFlow(
  {
    name: 'suggestTaskTagsFlow',
    inputSchema: SuggestTaskTagsInputSchema,
    outputSchema: SuggestTaskTagsOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
