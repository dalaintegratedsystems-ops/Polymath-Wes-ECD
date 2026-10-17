import type { Metadata } from 'next';
import type { JourneyStep } from '@wes/ui';
import { RegistrationView } from '@/components/views';
import { requireCentre } from '@/lib/server/session';

export const metadata: Metadata = { title: 'Registration' };
export const dynamic = 'force-dynamic';

// Wes's own guided workflow (not official rules). Steps come alive in Milestone 3.
const JOURNEY: JourneyStep[] = [
  {
    id: 'audit',
    title: 'Check where you stand',
    detail: 'A few quick questions so Wes can see what’s missing',
    status: 'current',
  },
  {
    id: 'centre',
    title: 'Centre details',
    detail: 'Address, ages and number of children',
    status: 'todo',
  },
  {
    id: 'policies',
    title: 'Write your policies',
    detail: 'Wes drafts them with you',
    status: 'todo',
  },
  {
    id: 'documents',
    title: 'Photograph your documents',
    detail: 'Wes reminds you before anything expires',
    status: 'todo',
  },
  {
    id: 'pack',
    title: 'Review your application pack',
    detail: 'One PDF with everything together',
    status: 'todo',
  },
  { id: 'submit', title: 'Submit to your district office', status: 'todo' },
];

export default async function RegistrationPage() {
  await requireCentre();
  return <RegistrationView steps={JOURNEY} />;
}
