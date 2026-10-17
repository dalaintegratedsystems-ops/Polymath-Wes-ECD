import type { Metadata } from 'next';
import { PlanView } from '@/components/views';
import { requireCentre } from '@/lib/server/session';

export const metadata: Metadata = { title: 'Weekly plan' };
export const dynamic = 'force-dynamic';

// Weekly plans arrive in Milestone 4; until then the empty state invites Wes to help.
export default async function PlanPage() {
  await requireCentre();
  return <PlanView plan={null} />;
}
