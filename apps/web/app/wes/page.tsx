import type { Metadata } from 'next';
import { demo } from '@wes/ui';
import { WesView } from '@/components/views';

export const metadata: Metadata = { title: 'Ask Wes' };

export default async function WesPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  return (
    <WesView
      messages={q ? [] : demo.demoChat}
      suggestions={demo.demoSuggestions}
      initialDraft={typeof q === 'string' ? q.slice(0, 500) : ''}
    />
  );
}
