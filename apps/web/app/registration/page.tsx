import type { Metadata } from 'next';
import type { JourneyStep } from '@wes/ui';
import { RegistrationView } from '@/components/views';
import { getProgress } from '@/lib/server/data';
import { requireCentre } from '@/lib/server/session';

export const metadata: Metadata = { title: 'Registration' };
export const dynamic = 'force-dynamic';

// Wes's own guided workflow, not official rules.
const TITLES: Record<string, string> = {
  audit: 'Check where you stand',
  centre: 'Centre details',
  policies: 'Write your policies',
  documents: 'Photograph your documents',
  pack: 'Review your application pack',
  submit: 'Submit to your district office',
};

export default async function RegistrationPage() {
  const { token, membership } = await requireCentre();
  const progress = await getProgress(token, membership.centreId);
  const steps: JourneyStep[] = progress.steps.map((s) => ({
    id: s.id,
    title: TITLES[s.id] ?? s.id,
    detail: s.detail,
    status: s.status,
  }));
  return (
    <RegistrationView
      steps={steps}
      percent={progress.percent}
      expiringDocuments={progress.expiringDocuments}
    />
  );
}
