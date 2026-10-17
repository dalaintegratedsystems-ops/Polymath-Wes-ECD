import type { Metadata } from 'next';
import { WelcomeView } from '@/components/views';

export const metadata: Metadata = { title: 'Welcome' };

export default function WelcomePage() {
  return <WelcomeView />;
}
