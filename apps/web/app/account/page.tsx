import type { Metadata } from 'next';
import { AppShell, Avatar, Card, PageHeader, buttonClass } from '@wes/ui';
import { signOut } from '@/app/actions';
import { nextRenderLink } from '@/lib/render-link';
import { requireSession } from '@/lib/server/session';

export const metadata: Metadata = { title: 'Account' };
export const dynamic = 'force-dynamic';

const ROLE_LABEL = {
  principal: 'Principal',
  practitioner: 'Practitioner',
  parent: 'Parent or caregiver',
  funder: 'Funder',
  admin: 'Platform admin',
} as const;

export default async function AccountPage() {
  const { me } = await requireSession();
  return (
    <AppShell active="home" renderLink={nextRenderLink}>
      <PageHeader title="Your account" />
      <main className="space-y-4 px-4">
        <Card className="flex items-center gap-4">
          <Avatar name={me.displayName} size={56} />
          <div>
            <p className="text-xl font-black text-ink">{me.displayName}</p>
            <p className="text-sm text-ink-muted">Signed in with your cellphone number</p>
          </div>
        </Card>
        <Card>
          <h2 className="font-black text-ink">Your centres</h2>
          <ul className="mt-2 divide-y divide-line">
            {me.memberships.map((m) => (
              <li key={m.centreId} className="flex justify-between gap-3 py-3">
                <span className="font-extrabold text-ink">{m.centreName}</span>
                <span className="text-sm text-ink-muted">{ROLE_LABEL[m.role]}</span>
              </li>
            ))}
          </ul>
        </Card>
        <form action={signOut}>
          <button
            type="submit"
            className={buttonClass({ variant: 'secondary', size: 'lg', block: true })}
          >
            Sign out
          </button>
        </form>
      </main>
    </AppShell>
  );
}
