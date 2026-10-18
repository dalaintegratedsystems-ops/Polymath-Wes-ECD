import { HomeScreen, demo } from '@wes/ui';
import { can } from '@wes/shared';
import { getCentre, getChildren, getProgress } from '@/lib/server/data';
import { redirect } from 'next/navigation';
import { mediaUrl } from '@/lib/media';
import { requireCentre, requireSession } from '@/lib/server/session';
import { nextRenderLink } from '@/lib/render-link';
import { sastNow } from '@/lib/today';

export const dynamic = 'force-dynamic';

const NEXT_LABEL: Record<string, string> = {
  audit: 'Check where you stand',
  centre: 'Centre details',
  policies: 'Policies',
  documents: 'Documents',
  pack: 'Application pack',
  submit: 'Submit',
};

/**
 * Home: the signed-in user's centre. Registration progress, attendance and weekly plans
 * arrive in Milestones 3–5; until then the cards invite the first step instead.
 */
export default async function HomePage() {
  // Dala admins may have no centre of their own: their home is the platform console.
  const session = await requireSession();
  if (!session.membership && session.me.isPlatformAdmin) redirect('/admin');
  const { token, me, membership } = await requireCentre();
  const now = sastNow();
  const [centre, children, progress] = await Promise.all([
    getCentre(token, membership.centreId),
    can(membership.role, 'child:read')
      ? getChildren(token, membership.centreId)
      : Promise.resolve([]),

    can(membership.role, 'compliance:read') && membership.role !== 'admin'
      ? getProgress(token, membership.centreId)
      : Promise.resolve(null),
  ]);
  const nextStep = progress?.steps.find((s) => s.status === 'current');

  return (
    <HomeScreen
      renderLink={nextRenderLink}
      data={{
        userName: me.displayName,
        avatarUrl: mediaUrl(me.avatarUrl),
        showDashboard: can(membership.role, 'dashboard:read'),
        showAdmin: me.isPlatformAdmin,
        centreName: centre.name,
        dateLabel: now.dateLabel,
        hour: now.hour,
        registration: progress
          ? {
              percent: progress.percent,
              stepsLeft: progress.steps.filter((s) => s.status !== 'done').length,
              nextStep: nextStep
                ? `${NEXT_LABEL[nextStep.id]}: ${nextStep.detail}`
                : 'All steps done.',
            }
          : undefined,
        childrenCount: children.filter((c) => c.status === 'active').length,
        suggestions: demo.demoHome.suggestions,
      }}
    />
  );
}
