import { downloadDocument } from '@/lib/documents';

/** A PDF summary of a finished game, in the visitor's language. */
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return downloadDocument(`/brand-games/${encodeURIComponent(slug)}/summary.pdf`);
}
