import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { ChangePasswordView } from '@/components/views';
import { requireSession } from '@/lib/server/session';

export const metadata: Metadata = { title: 'Choose a password' };
export const dynamic = 'force-dynamic';

export default async function ChangePasswordPage() {
  const { me } = await requireSession(true);
  // Phone-only accounts have no password to change.
  if (!me.username) redirect('/account');
  return <ChangePasswordView forced={me.mustChangePassword} />;
}
