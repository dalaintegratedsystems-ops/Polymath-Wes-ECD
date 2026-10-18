import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import type { ManagedUser } from '@wes/shared';
import { PeopleView } from '@/components/views';
import { api } from '@/lib/server/api';
import { requireSession } from '@/lib/server/session';

export const metadata: Metadata = { title: 'People' };
export const dynamic = 'force-dynamic';

export default async function PeoplePage() {
  const { token, me } = await requireSession();
  const runs = me.memberships.filter((m) => m.role === 'principal');
  if (!me.isPlatformAdmin && runs.length === 0) redirect('/');
  const { items } = await api<{ items: ManagedUser[] }>('/v1/admin/users', { token });

  // Admins add people to any centre seen in the list; principals to the centres they run.
  const centres = new Map<string, string>();
  for (const m of runs) centres.set(m.centreId, m.centreName);
  if (me.isPlatformAdmin) for (const p of items) centres.set(p.centreId, p.centreName);

  return (
    <PeopleView
      people={items.filter((p) => p.userId !== me.id)}
      centres={[...centres].map(([id, name]) => ({ id, name }))}
      isPlatformAdmin={me.isPlatformAdmin}
    />
  );
}
