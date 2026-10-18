import type { Metadata } from 'next';
import { SubmitView } from '@/components/views';
import { getCentre } from '@/lib/server/data';
import { requireCentre } from '@/lib/server/session';

export const metadata: Metadata = { title: 'Submit' };
export const dynamic = 'force-dynamic';

export default async function SubmitPage() {
  const { token, membership } = await requireCentre();
  const centre = await getCentre(token, membership.centreId);
  return (
    <SubmitView
      submitted={['submitted', 'conditionally_registered', 'registered'].includes(
        centre.registrationStatus,
      )}
      canSubmit={membership.role === 'principal'}
    />
  );
}
