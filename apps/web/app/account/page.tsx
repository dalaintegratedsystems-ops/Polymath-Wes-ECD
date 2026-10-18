import type { Metadata } from 'next';
import Link from 'next/link';
import { AppShell, Card, PageHeader, buttonClass } from '@wes/ui';
import { signOut } from '@/app/actions';
import { AvatarPicker, LogoPicker } from '@/components/views';
import { getCentre } from '@/lib/server/data';
import { mediaUrl } from '@/lib/media';
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

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ changed?: string }>;
}) {
  const { token, me, membership } = await requireSession();
  const { changed } = await searchParams;
  const runsCentre = membership?.role === 'principal';
  const centre = runsCentre ? await getCentre(token, membership.centreId) : null;

  return (
    <AppShell active="home" renderLink={nextRenderLink}>
      <PageHeader title="Your account" />
      <main className="space-y-4 px-4 pb-6">
        {changed && (
          <p role="status" className="rounded-md bg-success-soft px-4 py-3 font-bold text-success">
            Your new password is saved.
          </p>
        )}
        <Card className="space-y-3">
          <div>
            <p className="text-xl font-black text-ink">{me.displayName}</p>
            <p className="text-sm text-ink-muted">
              {me.username
                ? `Signed in as @${me.username}`
                : 'Signed in with your cellphone number'}
            </p>
          </div>
          <AvatarPicker name={me.displayName} src={mediaUrl(me.avatarUrl)} />
          <p className="text-sm text-ink-muted">
            A photo of you helps parents and your team recognise you. Please never upload photos of
            children here.
          </p>
        </Card>

        {centre && (
          <Card className="space-y-3">
            <h2 className="font-black text-ink">{centre.name} logo</h2>
            <LogoPicker name={centre.name} src={mediaUrl(centre.logoUrl)} />
          </Card>
        )}

        <Card>
          <h2 className="font-black text-ink">Your centres</h2>
          {me.memberships.length === 0 ? (
            <p className="mt-2 text-sm text-ink-muted">You are not linked to a centre.</p>
          ) : (
            <ul className="mt-2 divide-y divide-line">
              {me.memberships.map((m) => (
                <li key={m.centreId} className="flex justify-between gap-3 py-3">
                  <span className="font-extrabold text-ink">{m.centreName}</span>
                  <span className="text-sm text-ink-muted">{ROLE_LABEL[m.role]}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <nav aria-label="Account links" className="grid gap-3">
          {(runsCentre || me.isPlatformAdmin) && (
            <Link href="/people" className={buttonClass({ variant: 'secondary', block: true })}>
              Manage people
            </Link>
          )}
          {me.isPlatformAdmin && (
            <Link href="/admin" className={buttonClass({ variant: 'secondary', block: true })}>
              Platform console
            </Link>
          )}
          {me.username && (
            <Link
              href="/account/password"
              className={buttonClass({ variant: 'secondary', block: true })}
            >
              Change password
            </Link>
          )}
        </nav>

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
