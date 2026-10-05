import { downloadDocument } from '@/lib/documents';

/** Final results as CSV; the backend answers 404 unless the game was run for this client. */
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return downloadDocument(`/brand-games/${encodeURIComponent(slug)}/results.csv`);
}
