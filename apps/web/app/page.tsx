import { HomeScreen, demo } from '@wes/ui';
import { can } from '@wes/shared';
import { getCentre, getChildren } from '@/lib/server/data';
import { redirect } from 'next/navigation';
import { mediaUrl } from '@/lib/media';
import { requireCentre, requireSession } from '@/lib/server/session';
import { nextRenderLink } from '@/lib/render-link';
import { sastNow } from '@/lib/today';

export const dynamic = 'force-dynamic';

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
  const [centre, children] = await Promise.all([
    getCentre(token, membership.centreId),
    can(membership.role, 'child:read')
      ? getChildren(token, membership.centreId)
      : Promise.resolve([]),
  ]);

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
        registration: {
          percent: 8,
          stepsLeft: 6,
          nextStep: 'Check where you stand: a few quick questions so Wes can see what’s missing.',
        },
        childrenCount: children.filter((c) => c.status === 'active').length,
        suggestions: demo.demoHome.suggestions,
      }}
    />
  );
}
