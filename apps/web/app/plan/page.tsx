import type { Metadata } from 'next';
import { demo } from '@wes/ui';
import { PlanView } from '@/components/views';
import { sastNow } from '@/lib/today';

export const metadata: Metadata = { title: 'Weekly plan' };
export const dynamic = 'force-dynamic';

export default function PlanPage() {
  const { weekdayKey } = sastNow();
  const todayKey = demo.demoPlan.days.some((d) => d.key === weekdayKey) ? weekdayKey : 'mon';
  return <PlanView plan={demo.demoPlan} todayKey={todayKey} demo />;
}
