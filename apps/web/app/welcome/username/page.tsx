import type { Metadata } from 'next';
import { PasswordSignInView } from '@/components/views';

export const metadata: Metadata = { title: 'Sign in with a username' };

export default function UsernameSignInPage() {
  return <PasswordSignInView />;
}
