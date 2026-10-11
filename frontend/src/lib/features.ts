/**
 * Switches for parts of the app that can be turned off without touching the
 * rest. Read at build time, so changing one needs a rebuild.
 */

/**
 * Guided tours, the welcome prompt and the Interactive Guide page. Off unless
 * NEXT_PUBLIC_TUTORIAL_ENABLED=true; everything else works the same without it.
 */
export const TUTORIAL_ENABLED = process.env.NEXT_PUBLIC_TUTORIAL_ENABLED === 'true';
