import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { CentreDashboardScreen, type CentreDashboardData } from '@wes/ui';
import { can } from '@wes/shared';
import { api } from '@/lib/server/api';
import { requireCentre } from '@/lib/server/session';
import { nextRenderLink } from '@/lib/render-link';
import { sastNow } from '@/lib/today';

export const metadata: Metadata = { title: 'Your progress' };
export const dynamic = 'force-dynamic';

const DAY_MS = 86_400_000;
const ALLOWED_DAYS = [7, 28, 90];

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const { token, membership } = await requireCentre();
  if (!can(membership.role, 'dashboard:read')) redirect('/');
  const asked = Number((await searchParams).days);
  const days = ALLOWED_DAYS.includes(asked) ? asked : 28;
  const to = sastNow().iso;
  const from = new Date(Date.parse(to) - (days - 1) * DAY_MS).toISOString().slice(0, 10);
  const data = await api<Omit<CentreDashboardData, 'centreName'>>(
    `/v1/centres/${membership.centreId}/dashboard?from=${from}&to=${to}`,
    { token },
  );
  return (
    <CentreDashboardScreen
      data={{ ...data, centreName: membership.centreName }}
      rangeDays={days}
      canManagePeople={membership.role === 'principal'}
      renderLink={nextRenderLink}
    />
  );
}
