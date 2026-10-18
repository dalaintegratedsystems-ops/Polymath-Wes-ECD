import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AppShell, Card, PageHeader, SproutBook, buttonClass } from '@wes/ui';
import { nextRenderLink } from '@/lib/render-link';
import { requireCentre } from '@/lib/server/session';

export const metadata: Metadata = { title: 'Registration' };
export const dynamic = 'force-dynamic';

const STEPS: Record<string, string> = {
  audit: 'Check where you stand',
  centre: 'Centre details',
  policies: 'Write your policies',
  documents: 'Photograph your documents',
  pack: 'Review your application pack',
  submit: 'Submit to your district office',
};

/** Each registration step gets its own guided screen in Milestone 3; until then, a clear next step. */
export default async function RegistrationStepPage({
  params,
}: {
  params: Promise<{ step: string }>;
}) {
  const { step } = await params;
  const title = STEPS[step];
  if (!title) notFound();
  await requireCentre();
  return (
    <AppShell active="registration" renderLink={nextRenderLink}>
      <PageHeader title={title} />
      <main className="space-y-4 px-4 pb-6">
        <Card className="text-center">
          <SproutBook className="mx-auto w-40" />
          <p className="mt-3 font-black text-ink">This step is being built</p>
          <p className="mt-1 text-ink-muted">
            Soon Wes will guide you through it here. You can already ask Wes about it.
          </p>
        </Card>
        <Link
          href={`/wes?q=${encodeURIComponent(`Help me with: ${title}`)}`}
          className={buttonClass({ size: 'lg', block: true })}
        >
          Ask Wes about this step
        </Link>
        <Link href="/registration" className={buttonClass({ variant: 'secondary', block: true })}>
          Back to registration
        </Link>
      </main>
    </AppShell>
  );
}
