import type { Metadata } from 'next';
import { AGE_GROUPS, can, eldaLabel, type WeeklyPlan } from '@wes/shared';
import type { PlannerPlan } from '@wes/ui';
import { PlannerView } from '@/components/views';
import { getWeekPlan } from '@/lib/server/data';
import { requireCentre } from '@/lib/server/session';
import { planWeek, sastNow } from '@/lib/today';

export const metadata: Metadata = { title: 'Weekly plan' };
export const dynamic = 'force-dynamic';

const SHORT: Record<string, string> = {
  mon: 'Mon',
  tue: 'Tue',
  wed: 'Wed',
  thu: 'Thu',
  fri: 'Fri',
};
const AGE_SHORT: Record<string, string> = {
  babies: 'Babies',
  toddlers: 'Toddlers',
  preschool: '3 to 5',
};

function toView(p: WeeklyPlan): PlannerPlan {
  return {
    id: p.id,
    theme: p.theme,
    status: p.status,
    source: p.source,
    themeWords: p.body.themeWords,
    citations: p.citations,
    days: p.body.days.map((d) => ({
      key: d.day,
      short: SHORT[d.day] ?? d.day,
      activities: d.activities.map((a) => ({
        id: a.id,
        slot: a.slot,
        title: a.title,
        durationMinutes: a.durationMinutes,
        ages: a.ageGroups.map((g) => AGE_SHORT[g] ?? g),
        eldas: a.eldas.map(eldaLabel),
        materials: a.materials,
        steps: a.steps,
        printable: a.printable,
      })),
    })),
  };
}

export default async function PlanPage() {
  const { token, membership } = await requireCentre();
  const now = sastNow();
  const week = planWeek(now.iso);
  const canEdit = can(membership.role, 'plan:write');
  const plan = canEdit ? await getWeekPlan(token, membership.centreId, week.starting) : null;
  return (
    <PlannerView
      key={plan?.id ?? 'none'}
      weekLabel={week.label}
      weekStarting={week.starting}
      plan={plan ? toView(plan) : null}
      todayKey={now.weekdayKey}
      canEdit={canEdit}
      ageOptions={AGE_GROUPS.map((g) => ({ value: g.code, label: g.label }))}
      printAction="/plan/print"
    />
  );
}
