import type { PortalAudience, PortalSession } from './portal-store';

export interface PortalBranding {
  name: string;
  logoUrl?: string;
}

/** Everything a portal response may say about the session. No ids leave the server. */
export const toMeDto = (
  session: PortalSession,
  subjectName: string | undefined,
  branding: PortalBranding | undefined,
) => ({
  user: { name: session.name, email: session.email, audience: session.audience, role: session.role },
  subject: { name: subjectName ?? session.name },
  company: branding ? { name: branding.name, logoUrl: branding.logoUrl ?? null } : null,
});

export const toBrandingDto = (branding: PortalBranding, audience: PortalAudience) => ({
  name: branding.name,
  logoUrl: branding.logoUrl ?? null,
  audience,
});
