import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { VerifyView } from '@/components/views';
import { COOKIES } from '@/lib/session-cookies';

export const metadata: Metadata = { title: 'Enter your PIN' };

/** "+27 82 *** **67": enough for a person to recognise their own number. */
function mask(e164: string): string {
  return `${e164.slice(0, 3)} ${e164.slice(3, 5)} *** **${e164.slice(-2)}`;
}

export default async function VerifyPage() {
  const phone = (await cookies()).get(COOKIES.pendingPhone)?.value;
  if (!phone) redirect('/welcome');
  return <VerifyView maskedPhone={mask(phone)} />;
}
