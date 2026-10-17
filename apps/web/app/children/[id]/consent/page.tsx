import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { can } from '@wes/shared';
import { ConsentView } from '@/components/views';
import { getChildren } from '@/lib/server/data';
import { requireCentre } from '@/lib/server/session';

export const metadata: Metadata = { title: 'Consent' };
export const dynamic = 'force-dynamic';

export default async function ConsentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { token, membership } = await requireCentre();
  if (!can(membership.role, 'child:write')) redirect('/children');
  const child = (await getChildren(token, membership.centreId)).find((c) => c.id === id);
  if (!child) notFound();
  if (child.status === 'active') redirect('/children');
  return <ConsentView childId={child.id} childName={child.firstName} />;
}
