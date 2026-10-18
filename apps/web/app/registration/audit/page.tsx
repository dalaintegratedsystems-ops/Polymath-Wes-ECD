import type { Metadata } from 'next';
import { can } from '@wes/shared';
import { SelfAuditView } from '@/components/views';
import { getChecklist, getLatestAudit } from '@/lib/server/data';
import { requireCentre } from '@/lib/server/session';

export const metadata: Metadata = { title: 'Check where you stand' };
export const dynamic = 'force-dynamic';

export default async function SelfAuditPage() {
  const { token, membership } = await requireCentre();
  const [checklist, latest] = await Promise.all([
    getChecklist(token, membership.centreId),
    getLatestAudit(token, membership.centreId),
  ]);
  return (
    <SelfAuditView
      key={latest?.id ?? 'none'}
      items={checklist.items}
      isPlaceholder={checklist.isPlaceholder}
      latest={latest}
      canRun={can(membership.role, 'compliance:write')}
    />
  );
}
