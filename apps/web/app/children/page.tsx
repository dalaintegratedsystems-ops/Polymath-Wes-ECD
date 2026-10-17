import type { Metadata } from 'next';
import { can } from '@wes/shared';
import { ChildrenView } from '@/components/views';
import { getChildren, groupsOf } from '@/lib/server/data';
import { requireCentre } from '@/lib/server/session';

export const metadata: Metadata = { title: 'Children' };
export const dynamic = 'force-dynamic';

export default async function ChildrenPage() {
  const { token, membership } = await requireCentre();
  const children = can(membership.role, 'child:read')
    ? await getChildren(token, membership.centreId)
    : [];

  return (
    <ChildrenView
      childrenList={children.map((c) => ({
        id: c.id,
        firstName: c.firstName,
        birthMonth: c.birthMonth,
        group: c.groupName,
        present: null,
        status: c.status,
      }))}
      groups={groupsOf(children).map((g) => g.name)}
      todayIso={new Date().toISOString()}
      attendance={false}
      canAdd={can(membership.role, 'child:write')}
    />
  );
}
