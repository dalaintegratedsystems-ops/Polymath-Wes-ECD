import type { Metadata } from 'next';
import { can } from '@wes/shared';
import { CentreDetailsView } from '@/components/views';
import { getCentre } from '@/lib/server/data';
import { requireCentre } from '@/lib/server/session';

export const metadata: Metadata = { title: 'Centre details' };
export const dynamic = 'force-dynamic';

export default async function CentreDetailsPage() {
  const { token, membership } = await requireCentre();
  const c = await getCentre(token, membership.centreId);
  return (
    <CentreDetailsView
      canEdit={can(membership.role, 'centre:update')}
      initial={{
        name: c.name,
        addressLine: c.addressLine,
        suburb: c.suburb,
        city: c.city,
        childCount: c.childCount,
        agesServedMinMonths: c.agesServedMinMonths,
        agesServedMaxMonths: c.agesServedMaxMonths,
      }}
    />
  );
}
