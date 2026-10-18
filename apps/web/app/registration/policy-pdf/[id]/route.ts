import { proxyCentreFile } from '@/lib/server/files';

/** A policy as a low-ink PDF. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyCentreFile(`/v1/policies/${id}/pdf`, id);
}
