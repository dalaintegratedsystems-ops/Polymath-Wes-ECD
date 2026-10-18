import type { Metadata } from 'next';
import { can } from '@wes/shared';
import { getProgress } from '@/lib/server/data';
import { PackView } from '@/components/views';
import { requireCentre } from '@/lib/server/session';

export const metadata: Metadata = { title: 'Application pack' };
export const dynamic = 'force-dynamic';

export default async function PackPage() {
  const { token, membership } = await requireCentre();
  const progress = await getProgress(token, membership.centreId);
  const step = (id: string) => progress.steps.find((s) => s.id === id);
  const done = (id: string) => step(id)?.status === 'done';
  return (
    <PackView
      canBuild={can(membership.role, 'compliance:write')}
      downloadAction="/registration/pack/download"
      builtAt={done('pack') ? 'an earlier visit' : null}
      checks={[
        { label: 'Self-audit done', ok: done('audit'), href: '/registration/audit' },
        { label: 'Centre details complete', ok: done('centre'), href: '/registration/centre' },
        {
          label: `Policies: ${step('policies')?.detail ?? ''}`,
          ok: done('policies'),
          href: '/registration/policies',
        },
        {
          label: `Documents: ${step('documents')?.detail ?? ''}`,
          ok: done('documents'),
          href: '/registration/documents',
        },
      ]}
    />
  );
}
