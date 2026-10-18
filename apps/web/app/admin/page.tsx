import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import {
  AdminConsoleScreen,
  type AdminCentreRow,
  type AdminFilters,
  type AdminMetricsData,
} from '@wes/ui';
import { api } from '@/lib/server/api';
import { requireSession } from '@/lib/server/session';
import { nextRenderLink } from '@/lib/render-link';

export const metadata: Metadata = { title: 'Platform' };
export const dynamic = 'force-dynamic';

const KEYS = ['from', 'to', 'province', 'city', 'size', 'status', 'role'] as const;

/** Keep only known, non-empty filters; the API validates their values. */
function filtersFrom(params: Record<string, string | string[] | undefined>): AdminFilters {
  const out: AdminFilters = {};
  for (const k of KEYS) {
    const v = params[k];
    if (typeof v === 'string' && v.trim()) out[k] = v.trim().slice(0, 60);
  }
  return out;
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { token, me } = await requireSession();
  if (!me.isPlatformAdmin) redirect('/');
  const filters = filtersFrom(await searchParams);
  const qs = new URLSearchParams(filters as Record<string, string>).toString();
  const [metrics, centres] = await Promise.all([
    api<AdminMetricsData>(`/v1/admin/metrics?${qs}`, { token }),
    api<{ items: AdminCentreRow[] }>(`/v1/admin/centres?${qs}`, { token }),
  ]);
  return (
    <AdminConsoleScreen
      metrics={metrics}
      centres={centres.items}
      filters={filters}
      exportHref={`/admin/export?${qs}`}
      renderLink={nextRenderLink}
    />
  );
}
