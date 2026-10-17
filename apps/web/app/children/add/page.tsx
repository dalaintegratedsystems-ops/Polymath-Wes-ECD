import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { can } from '@wes/shared';
import { AddChildView } from '@/components/views';
import { getChildren, groupsOf } from '@/lib/server/data';
import { requireCentre } from '@/lib/server/session';

export const metadata: Metadata = { title: 'Add a child' };
export const dynamic = 'force-dynamic';

export default async function AddChildPage() {
  const { token, membership } = await requireCentre();
  if (!can(membership.role, 'child:write')) redirect('/children');
  const children = await getChildren(token, membership.centreId);
  return <AddChildView groups={groupsOf(children)} todayIso={new Date().toISOString()} />;
}
