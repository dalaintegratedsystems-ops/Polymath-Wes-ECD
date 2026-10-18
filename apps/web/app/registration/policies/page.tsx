import type { Metadata } from 'next';
import { POLICY_KINDS, POLICY_TITLE } from '@wes/shared';
import { getPolicies } from '@/lib/server/data';
import { PoliciesView } from '@/components/views';
import { requireCentre } from '@/lib/server/session';

export const metadata: Metadata = { title: 'Policies' };
export const dynamic = 'force-dynamic';

export default async function PoliciesPage() {
  const { token, membership } = await requireCentre();
  const current = await getPolicies(token, membership.centreId);
  const policies = POLICY_KINDS.map((kind) => {
    const mine = current.filter((p) => p.kind === kind);
    const status = mine.some((p) => p.status === 'approved')
      ? ('approved' as const)
      : mine.some((p) => p.status === 'draft')
        ? ('draft' as const)
        : ('missing' as const);
    return { kind, title: POLICY_TITLE[kind], status };
  });
  return <PoliciesView policies={policies} />;
}
