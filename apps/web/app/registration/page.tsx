import type { Metadata } from 'next';
import { demo } from '@wes/ui';
import { RegistrationView } from '@/components/views';

export const metadata: Metadata = { title: 'Registration' };

export default function RegistrationPage() {
  return <RegistrationView steps={demo.demoSteps} demo />;
}
