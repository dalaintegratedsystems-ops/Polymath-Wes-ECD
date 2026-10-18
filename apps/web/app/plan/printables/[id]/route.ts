import { proxyCentreFile } from '@/lib/server/files';

/** A printable Wes made for you (the link Wes gives in chat). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyCentreFile(`/v1/printables/${id}/pdf`, id);
}
