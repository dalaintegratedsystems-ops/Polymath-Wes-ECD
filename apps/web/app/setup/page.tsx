import type { Metadata } from 'next';
import { SetupView } from '@/components/views';
import { requireSession } from '@/lib/server/session';

export const metadata: Metadata = { title: 'Set up your centre' };

export default async function SetupPage() {
  const { me } = await requireSession();
  return <SetupView initialName={me.displayName} />;
}
