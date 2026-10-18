import { proxyCentreFile } from '@/lib/server/files';

/** A saved registration document, fetched with the user's token (never a public URL). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyCentreFile(`/v1/compliance/documents/${id}/file`, id);
}
