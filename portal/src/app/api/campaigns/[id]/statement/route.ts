import { downloadDocument } from '@/lib/documents';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return downloadDocument(`/campaigns/${encodeURIComponent(id)}/statement.pdf`);
}
