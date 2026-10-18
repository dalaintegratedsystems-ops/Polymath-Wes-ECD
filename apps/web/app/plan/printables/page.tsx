import type { Metadata } from 'next';
import { can } from '@wes/shared';
import { PrintablesView } from '@/components/views';
import { getWeekPlan } from '@/lib/server/data';
import { requireCentre } from '@/lib/server/session';
import { planWeek, sastNow } from '@/lib/today';

export const metadata: Metadata = { title: 'Printables' };
export const dynamic = 'force-dynamic';

export default async function PrintablesPage() {
  const { token, membership } = await requireCentre();
  const plan = can(membership.role, 'plan:write')
    ? await getWeekPlan(token, membership.centreId, planWeek(sastNow().iso).starting)
    : null;
  return <PrintablesView printAction="/plan/print" suggestedWords={plan?.body.themeWords ?? []} />;
}
