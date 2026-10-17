import type { Metadata } from 'next';
import type { ChatMessage } from '@wes/ui';
import { demo } from '@wes/ui';
import type { AssistantTurn } from '@wes/shared';
import { WesChat } from '@/components/wes-chat';
import { api } from '@/lib/server/api';
import { requireCentre } from '@/lib/server/session';

export const metadata: Metadata = { title: 'Ask Wes' };
export const dynamic = 'force-dynamic';

export default async function WesPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { token, membership } = await requireCentre();
  const { q } = await searchParams;
  const [convo, meta] = await Promise.all([
    api<{ conversationId: string | null; messages: AssistantTurn[] }>(
      '/v1/assistant/conversations/latest',
      {
        token,
        centreId: membership.centreId,
      },
    ).catch(() => ({ conversationId: null, messages: [] })),
    api<{ assistantMode: 'live' | 'offline' }>('/v1/meta').catch(() => ({
      assistantMode: 'live' as const,
    })),
  ]);

  const messages: ChatMessage[] = convo.messages.map((m) => ({
    id: m.id,
    role: m.role === 'user' ? 'user' : 'wes',
    text: m.text,
    citations: m.citations,
    safety: m.safety,
  }));

  return (
    <WesChat
      initialMessages={messages}
      initialConversationId={convo.conversationId}
      suggestions={demo.demoSuggestions}
      initialDraft={typeof q === 'string' ? q.slice(0, 500) : ''}
      offlineMode={meta.assistantMode === 'offline'}
    />
  );
}
