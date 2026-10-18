import type { Metadata } from 'next';
import { can } from '@wes/shared';
import { RegisterView } from '@/components/register';
import { getAttendanceDay, getChildren, groupsOf } from '@/lib/server/data';
import { requireCentre } from '@/lib/server/session';
import { sastNow } from '@/lib/today';

export const metadata: Metadata = { title: 'Children' };
export const dynamic = 'force-dynamic';

export default async function ChildrenPage() {
  const { token, membership } = await requireCentre();
  const today = sastNow();
  const canMark = can(membership.role, 'attendance:write');
  const [children, attendance] = await Promise.all([
    can(membership.role, 'child:read') ? getChildren(token, membership.centreId) : [],
    canMark ? getAttendanceDay(token, membership.centreId, today.iso) : null,
  ]);
  const marks = new Map(attendance?.marks.map((m) => [m.childId, m.status]) ?? []);

  return (
    <RegisterView
      centreId={membership.centreId}
      day={today.iso}
      childrenList={children.map((c) => ({
        id: c.id,
        firstName: c.firstName,
        birthMonth: c.birthMonth,
        group: c.groupName,
        present: marks.has(c.id) ? marks.get(c.id) === 'present' : null,
        status: c.status,
      }))}
      groups={groupsOf(children).map((g) => g.name)}
      todayIso={new Date().toISOString()}
      canMark={canMark}
      canAdd={can(membership.role, 'child:write')}
      exportHref={
        can(membership.role, 'attendance:export')
          ? `/children/export?month=${today.iso.slice(0, 7)}`
          : null
      }
    />
  );
}
