import type { Metadata } from 'next';
import { demo } from '@wes/ui';
import { WesView } from '@/components/views';
import { requireCentre } from '@/lib/server/session';

export const metadata: Metadata = { title: 'Ask Wes' };
export const dynamic = 'force-dynamic';

// The streaming agent arrives in Milestone 2.
export default async function WesPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireCentre();
  const { q } = await searchParams;
  return (
    <WesView
      messages={[]}
      suggestions={demo.demoSuggestions}
      initialDraft={typeof q === 'string' ? q.slice(0, 500) : ''}
    />
  );
}
