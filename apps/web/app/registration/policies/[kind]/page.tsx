import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { POLICY_KINDS, POLICY_QUESTIONS, POLICY_TITLE, can, type PolicyKind } from '@wes/shared';
import { PolicyView } from '@/components/views';
import { getPolicies, getPolicy } from '@/lib/server/data';
import { requireCentre } from '@/lib/server/session';

export const metadata: Metadata = { title: 'Policy' };
export const dynamic = 'force-dynamic';

export default async function PolicyPage({ params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  if (!(POLICY_KINDS as readonly string[]).includes(kind)) notFound();
  const k = kind as PolicyKind;
  const { token, membership } = await requireCentre();
  const list = (await getPolicies(token, membership.centreId)).filter((p) => p.kind === k);
  // Prefer the draft being worked on; otherwise the approved version.
  const pick = list.find((p) => p.status === 'draft') ?? list.find((p) => p.status === 'approved');
  const policy = pick ? await getPolicy(token, membership.centreId, pick.id) : null;
  return (
    <PolicyView
      key={policy ? `${policy.id}-${policy.updatedAt}` : 'new'}
      kind={k}
      title={POLICY_TITLE[k]}
      questions={POLICY_QUESTIONS[k]}
      initialAnswers={policy?.answers ?? {}}
      policy={policy}
      canEdit={can(membership.role, 'policy:write')}
      canApprove={membership.role === 'principal'}
      pdfHref={policy ? `/registration/policy-pdf/${policy.id}` : null}
    />
  );
}
