'use client';

import { useRef, useState, type FormEvent } from 'react';
import { ChoiceChips, Field, FormError, Select, TextInput } from '../forms';
import { ArrowRightIcon, CameraIcon, KeyIcon, PeopleIcon, ShieldIcon } from '../icons';
import { defaultRenderLink, type RenderLink } from '../nav';
import { Avatar, Button, buttonClass, Card, Chip, cx } from '../primitives';
import { AppShell, PageHeader } from '../shell';

type Result = Promise<string | null>;

function useBusy() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (fn: () => Result) => {
    setBusy(true);
    setError(null);
    try {
      setError(await fn());
    } catch {
      setError('Something went wrong. Check your signal and try again.');
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, setError, run };
}

// ---------- Username sign-in ----------

export function PasswordSignInScreen({
  onSubmit,
  renderLink = defaultRenderLink,
}: {
  onSubmit: (v: { username: string; password: string }) => Result;
  renderLink?: RenderLink;
}) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const { busy, error, run } = useBusy();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run(() => onSubmit({ username, password }));
  };
  return (
    <div className="min-h-dvh bg-canvas">
      <main className="mx-auto max-w-md px-4 pt-[calc(env(safe-area-inset-top)+2rem)] pb-10">
        <span className="grid size-12 place-items-center rounded-full bg-brand-soft text-brand-strong">
          <KeyIcon size={24} />
        </span>
        <h1 className="mt-4 text-[1.75rem] leading-tight font-black text-ink">
          Sign in with a username
        </h1>
        <p className="mt-1 text-ink-muted">For accounts your principal or Dala set up for you.</p>
        <form onSubmit={submit} noValidate className="mt-6 space-y-4">
          <Field label="Username" htmlFor="username">
            <TextInput
              id="username"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </Field>
          <Field label="Password" htmlFor="password">
            <TextInput
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <FormError message={error} />
          <Button
            type="submit"
            size="lg"
            block
            disabled={busy || username.trim().length < 3 || password.length === 0}
          >
            {busy ? 'Signing in…' : 'Sign in'}
            {!busy && <ArrowRightIcon size={20} />}
          </Button>
        </form>
        <p className="mt-6 text-center">
          {renderLink({
            href: '/welcome',
            className: buttonClass({ variant: 'ghost' }),
            children: 'Use my cellphone number instead',
          })}
        </p>
        <p className="mt-4 text-sm text-ink-muted">
          Forgot your password? Ask your principal to give you a new one.
        </p>
      </main>
    </div>
  );
}

// ---------- Choose a new password ----------

export function ChangePasswordScreen({
  forced,
  onSubmit,
  renderLink = defaultRenderLink,
}: {
  /** True right after signing in with a temporary password. */
  forced: boolean;
  onSubmit: (v: { currentPassword: string; newPassword: string }) => Result;
  renderLink?: RenderLink;
}) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const { busy, error, setError, run } = useBusy();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (next !== confirm) {
      setError('The two new passwords are not the same.');
      return;
    }
    void run(() => onSubmit({ currentPassword: current, newPassword: next }));
  };
  return (
    <div className="min-h-dvh bg-canvas">
      <main className="mx-auto max-w-md px-4 pt-[calc(env(safe-area-inset-top)+2rem)] pb-10">
        <span className="grid size-12 place-items-center rounded-full bg-success-soft text-success">
          <ShieldIcon size={24} />
        </span>
        <h1 className="mt-4 text-[1.75rem] leading-tight font-black text-ink">
          {forced ? 'Choose your own password' : 'Change your password'}
        </h1>
        <p className="mt-1 text-ink-muted">
          {forced
            ? 'You signed in with a temporary password. Choose one only you know.'
            : 'Use at least 10 characters. A short sentence is easy to remember and hard to guess.'}
        </p>
        <form onSubmit={submit} noValidate className="mt-6 space-y-4">
          <Field label={forced ? 'Temporary password' : 'Current password'} htmlFor="current">
            <TextInput
              id="current"
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
          </Field>
          <Field
            label="New password"
            hint="At least 10 characters, for example: the swing under the tree"
            htmlFor="new"
          >
            <TextInput
              id="new"
              type="password"
              autoComplete="new-password"
              value={next}
              aria-describedby="new-hint"
              onChange={(e) => setNext(e.target.value)}
            />
          </Field>
          <Field label="New password again" htmlFor="confirm">
            <TextInput
              id="confirm"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </Field>
          <FormError message={error} />
          <Button
            type="submit"
            size="lg"
            block
            disabled={busy || !current || next.length < 10 || !confirm}
          >
            {busy ? 'Saving…' : 'Save new password'}
          </Button>
        </form>
        {!forced && (
          <p className="mt-6 text-center">
            {renderLink({
              href: '/account',
              className: buttonClass({ variant: 'ghost' }),
              children: 'Back to your account',
            })}
          </p>
        )}
      </main>
    </div>
  );
}

// ---------- People management ----------

export type PersonRole = 'principal' | 'practitioner' | 'parent' | 'funder' | 'admin';

export interface PersonRow {
  userId: string;
  displayName: string;
  username: string | null;
  phoneMasked: string | null;
  role: PersonRole;
  centreId: string;
  centreName: string;
  status: 'active' | 'deactivated';
  lastSeenAt: string | null;
  mustChangePassword: boolean;
}

export const ROLE_LABEL: Record<PersonRole, string> = {
  principal: 'Principal',
  practitioner: 'Practitioner',
  parent: 'Parent or caregiver',
  funder: 'Funder',
  admin: 'Platform admin',
};

export interface NewPerson {
  displayName: string;
  centreId: string;
  role: PersonRole;
  username?: string;
  phone?: string;
}

type Created = { temporaryPassword: string | null } | { error: string };

export function PeopleScreen({
  people,
  centres,
  isPlatformAdmin,
  onCreate,
  onResetPassword,
  onSetStatus,
  renderLink = defaultRenderLink,
}: {
  people: PersonRow[];
  centres: { id: string; name: string }[];
  isPlatformAdmin: boolean;
  onCreate: (p: NewPerson) => Promise<Created>;
  onResetPassword: (userId: string) => Promise<Created>;
  onSetStatus: (userId: string, status: 'active' | 'deactivated') => Result;
  renderLink?: RenderLink;
}) {
  const roles: PersonRole[] = isPlatformAdmin
    ? ['principal', 'practitioner', 'parent', 'funder']
    : ['practitioner', 'parent'];
  const [adding, setAdding] = useState(people.length === 0);
  const [name, setName] = useState('');
  const [role, setRole] = useState<PersonRole>('practitioner');
  const [centreId, setCentreId] = useState(centres[0]?.id ?? '');
  const [username, setUsername] = useState('');
  const [phone, setPhone] = useState('');
  const [shown, setShown] = useState<{ who: string; password: string } | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const { busy, error, setError, run } = useBusy();

  const create = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const res = await onCreate({
        displayName: name.trim(),
        centreId,
        role,
        ...(username.trim() ? { username: username.trim().toLowerCase() } : {}),
        ...(phone.trim() ? { phone: phone.trim() } : {}),
      });
      if ('error' in res) return res.error;
      if (res.temporaryPassword) setShown({ who: name.trim(), password: res.temporaryPassword });
      setName('');
      setUsername('');
      setPhone('');
      setAdding(false);
      return null;
    });
  };

  const reset = async (p: PersonRow) => {
    setRowError(null);
    const res = await onResetPassword(p.userId);
    if ('error' in res) setRowError(res.error);
    else if (res.temporaryPassword)
      setShown({ who: p.displayName, password: res.temporaryPassword });
  };

  const toggle = async (p: PersonRow) => {
    setRowError(null);
    const next = p.status === 'active' ? 'deactivated' : 'active';
    if (
      next === 'deactivated' &&
      !window.confirm(`Switch off ${p.displayName}'s account? They will be signed out.`)
    ) {
      return;
    }
    const err = await onSetStatus(p.userId, next);
    if (err) setRowError(err);
  };

  return (
    <AppShell active="home" renderLink={renderLink}>
      <PageHeader
        title="People"
        subtitle={isPlatformAdmin ? 'Everyone on the platform' : 'Your centre team and parents'}
      />
      <main className="space-y-4 px-4 pb-6">
        {shown && (
          <Card tone="brand" role="status">
            <p className="font-black text-ink">Temporary password for {shown.who}</p>
            <p className="mt-2 rounded-md bg-surface px-3 py-3 text-center font-mono text-xl font-black break-all text-ink select-all">
              {shown.password}
            </p>
            <p className="mt-2 text-sm text-ink-muted">
              Give it to them in person or by phone. It is shown only once, and they will choose
              their own password when they sign in.
            </p>
            <Button className="mt-3" variant="secondary" block onClick={() => setShown(null)}>
              Done, I have shared it
            </Button>
          </Card>
        )}

        {adding ? (
          <Card>
            <h2 className="font-black text-ink">Add a person</h2>
            <form onSubmit={create} noValidate className="mt-3 space-y-4">
              <Field label="Name" htmlFor="p-name">
                <TextInput id="p-name" value={name} onChange={(e) => setName(e.target.value)} />
              </Field>
              <ChoiceChips
                label="Role"
                options={roles.map((r) => ({ value: r, label: ROLE_LABEL[r] }))}
                value={[role]}
                onChange={(v) => v[0] && setRole(v[0])}
              />
              {centres.length > 1 && (
                <Field label="Centre" htmlFor="p-centre">
                  <Select
                    id="p-centre"
                    value={centreId}
                    onChange={(e) => setCentreId(e.target.value)}
                  >
                    {centres.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
              <Field
                label="Cellphone number"
                hint="They can sign in with a PIN sent to this number."
                htmlFor="p-phone"
              >
                <TextInput
                  id="p-phone"
                  type="tel"
                  inputMode="tel"
                  placeholder="082 123 4567"
                  value={phone}
                  aria-describedby="p-phone-hint"
                  onChange={(e) => setPhone(e.target.value)}
                />
              </Field>
              <Field
                label="Username (optional)"
                hint="For people without their own phone. We make a temporary password."
                htmlFor="p-username"
              >
                <TextInput
                  id="p-username"
                  autoCapitalize="none"
                  spellCheck={false}
                  placeholder="thandi.m"
                  value={username}
                  aria-describedby="p-username-hint"
                  onChange={(e) => setUsername(e.target.value)}
                />
              </Field>
              <FormError message={error} />
              <div className="flex gap-3">
                <Button
                  type="submit"
                  className="flex-1"
                  disabled={
                    busy || !name.trim() || !centreId || (!username.trim() && !phone.trim())
                  }
                >
                  {busy ? 'Adding…' : 'Add person'}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setAdding(false);
                    setError(null);
                  }}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </Card>
        ) : (
          <Button size="lg" block icon={<PeopleIcon size={22} />} onClick={() => setAdding(true)}>
            Add a person
          </Button>
        )}

        <FormError message={rowError} />

        {people.length === 0 ? (
          <Card>
            <p className="text-ink-muted">No one here yet. Add your first team member above.</p>
          </Card>
        ) : (
          <ul className="space-y-3" aria-label="People">
            {people.map((p) => (
              <li key={`${p.userId}-${p.centreId}`}>
                <Card className={cx(p.status === 'deactivated' && 'opacity-70')}>
                  <div className="flex items-start gap-3">
                    <Avatar name={p.displayName} size={44} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-black text-ink">{p.displayName}</p>
                      <p className="text-sm text-ink-muted">
                        {ROLE_LABEL[p.role]}
                        {isPlatformAdmin ? `, ${p.centreName}` : ''}
                      </p>
                      <p className="mt-1 text-sm break-all text-ink-muted">
                        {[p.username && `@${p.username}`, p.phoneMasked]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {p.status === 'deactivated' && <Chip>Switched off</Chip>}
                        {p.mustChangePassword && p.status === 'active' && (
                          <Chip tone="accent">Has not signed in yet</Chip>
                        )}
                      </div>
                    </div>
                  </div>
                  {(p.role !== 'principal' || isPlatformAdmin) && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {p.username && p.status === 'active' && (
                        <Button
                          variant="secondary"
                          icon={<KeyIcon size={18} />}
                          onClick={() => void reset(p)}
                        >
                          New password
                        </Button>
                      )}
                      <Button variant="ghost" onClick={() => void toggle(p)}>
                        {p.status === 'active' ? 'Switch off' : 'Switch back on'}
                      </Button>
                    </div>
                  )}
                </Card>
              </li>
            ))}
          </ul>
        )}
      </main>
    </AppShell>
  );
}

// ---------- Profile photo and centre logo ----------

/**
 * Resize on the phone before upload (saves data, and re-encoding through a canvas drops
 * EXIF/GPS too). The server strips metadata again and never trusts the file type it is told.
 */
export async function resizeImage(file: File, max = 512): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('resize failed'))), 'image/jpeg', 0.85),
  );
}

export function PhotoPicker({
  name,
  src,
  label,
  onUpload,
  onRemove,
}: {
  name: string;
  src: string | null;
  label: string;
  onUpload: (image: Blob) => Result;
  onRemove?: () => Result;
}) {
  const input = useRef<HTMLInputElement>(null);
  const { busy, error, run } = useBusy();
  const pick = (file: File | undefined) => {
    if (!file) return;
    void run(async () => {
      const blob = await resizeImage(file).catch(() => null);
      if (!blob) return 'We could not read that picture. Try another one.';
      return onUpload(blob);
    });
  };
  return (
    <div>
      <div className="flex items-center gap-4">
        <Avatar name={name} src={src} size={72} />
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            icon={<CameraIcon size={20} />}
            disabled={busy}
            onClick={() => input.current?.click()}
          >
            {busy ? 'Saving…' : src ? `Change ${label}` : `Add ${label}`}
          </Button>
          {src && onRemove && (
            <Button variant="ghost" disabled={busy} onClick={() => void run(onRemove)}>
              Remove
            </Button>
          )}
        </div>
      </div>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        aria-label={`Choose a ${label}`}
        onChange={(e) => pick(e.target.files?.[0])}
      />
      <FormError message={error} />
    </div>
  );
}
