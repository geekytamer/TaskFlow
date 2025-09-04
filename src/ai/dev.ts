import { config } from 'dotenv';
config();

import '@/ai/flows/suggest-task-tags.ts';
import '@/ai/flows/send-email.ts';
import '@/ai/flows/seed-database.ts';
