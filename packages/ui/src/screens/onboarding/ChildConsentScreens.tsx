'use client';

import { useState, type FormEvent } from 'react';
import { CheckRow, ChoiceChips, Field, FormError, PinInput, Select, TextInput } from '../../forms';
import { ArrowRightIcon, SendIcon, ShieldIcon } from '../../icons';
import { Celebration } from '../../illustrations';
import { defaultRenderLink, type RenderLink } from '../../nav';
import { Button, Card, buttonClass } from '../../primitives';
import { AppShell, PageHeader } from '../../shell';
import type { Submit } from './AuthScreens';

export type Relationship =
  'mother' | 'father' | 'grandparent' | 'aunt_uncle' | 'guardian' | 'other';

const RELATIONSHIPS: { value: Relationship; label: string }[] = [
  { value: 'mother', label: 'Mother' },
  { value: 'father', label: 'Father' },
  { value: 'grandparent', label: 'Grandparent' },
  { value: 'aunt_uncle', label: 'Aunt or uncle' },
  { value: 'guardian', label: 'Guardian' },
  { value: 'other', label: 'Other' },
];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export interface ChildDraft {
  firstName: string;
  birthMonth: string;
  groupId?: string;
  guardian: { displayName: string; phone: string; relationship: Relationship };
}

/**
 * Add a child. We ask for as little as possible: first name, birth month, and who to ask
 * for consent. Nothing becomes a child record until that person agrees.
 */
export function AddChildScreen({
  groups,
  onSubmit,
  today = new Date(),
  renderLink = defaultRenderLink,
}: {
  groups: { id: string; name: string }[];
  onSubmit: Submit<ChildDraft>;
  today?: Date;
  renderLink?: RenderLink;
}) {
  const thisYear = today.getFullYear();
  const years = Array.from({ length: 8 }, (_, i) => thisYear - i);
  const [firstName, setFirstName] = useState('');
  const [month, setMonth] = useState('');
  const [year, setYear] = useState('');
  const [groupId, setGroupId] = useState('');
  const [guardianName, setGuardianName] = useState('');
  const [phone, setPhone] = useState('');
  const [relationship, setRelationship] = useState<Relationship>('mother');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready =
    firstName.trim() &&
    month &&
    year &&
    guardianName.trim() &&
    phone.replace(/\D/g, '').length >= 9;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setError(
        await onSubmit({
          firstName: firstName.trim(),
          birthMonth: `${year}-${month}`,
          ...(groupId ? { groupId } : {}),
          guardian: { displayName: guardianName.trim(), phone, relationship },
        }),
      );
    } catch {
      setError('Something went wrong. Check your signal and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppShell active="children" renderLink={renderLink}>
      <PageHeader
        title="Add a child"
        subtitle="Their parent or caregiver will be asked to agree first."
      />
      <main className="px-4 pb-6">
        <form onSubmit={submit} className="space-y-5">
          <Card className="space-y-4">
            <h2 className="text-lg font-black text-ink">The child</h2>
            <Field label="First name" htmlFor="first-name">
              <TextInput
                id="first-name"
                autoComplete="off"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
              />
            </Field>
            <fieldset>
              <legend className="mb-1.5 font-extrabold text-ink">Birth month</legend>
              <div className="grid grid-cols-2 gap-3">
                <Select aria-label="Month" value={month} onChange={(e) => setMonth(e.target.value)}>
                  <option value="" disabled>
                    Month
                  </option>
                  {MONTHS.map((m, i) => (
                    <option key={m} value={String(i + 1).padStart(2, '0')}>
                      {m}
                    </option>
                  ))}
                </Select>
                <Select aria-label="Year" value={year} onChange={(e) => setYear(e.target.value)}>
                  <option value="" disabled>
                    Year
                  </option>
                  {years.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </Select>
              </div>
            </fieldset>
            {groups.length > 0 && (
              <Field label="Group" hint="Optional" htmlFor="group">
                <Select id="group" value={groupId} onChange={(e) => setGroupId(e.target.value)}>
                  <option value="">Not in a group yet</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
          </Card>

          <Card className="space-y-4">
            <h2 className="text-lg font-black text-ink">Parent or caregiver</h2>
            <Field label="Their name" htmlFor="guardian-name">
              <TextInput
                id="guardian-name"
                autoComplete="off"
                value={guardianName}
                onChange={(e) => setGuardianName(e.target.value)}
              />
            </Field>
            <Field
              label="Their cellphone number"
              hint="We send them a PIN to agree. Stored encrypted."
              htmlFor="guardian-phone"
            >
              <TextInput
                id="guardian-phone"
                type="tel"
                inputMode="tel"
                autoComplete="off"
                placeholder="082 123 4567"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </Field>
            <ChoiceChips
              label="They are the child’s…"
              options={RELATIONSHIPS}
              value={[relationship]}
              onChange={([v]) => v && setRelationship(v)}
            />
          </Card>

          <p className="flex items-start gap-2 px-1 text-sm text-ink-muted">
            <ShieldIcon size={18} className="mt-0.5 shrink-0 text-success" />
            <span>
              We only keep the child’s first name, birth month and group. No surnames, ID numbers or
              photos.
            </span>
          </p>
          <FormError message={error} />
          <Button type="submit" size="lg" block disabled={busy || !ready}>
            {busy ? 'Saving…' : 'Next: ask for consent'}
            {!busy && <ArrowRightIcon size={20} />}
          </Button>
        </form>
      </main>
    </AppShell>
  );
}

export type ConsentPurpose = 'child_record' | 'progress_tracking' | 'photos' | 'parent_messages';

const PURPOSES: {
  value: ConsentPurpose;
  title: string;
  description: string;
  required?: boolean;
}[] = [
  {
    value: 'child_record',
    title: 'Keep a register record',
    description:
      'First name, birth month and daily attendance, for running the centre and subsidy claims.',
    required: true,
  },
  {
    value: 'parent_messages',
    title: 'Send me messages',
    description: 'News and reminders from the centre on WhatsApp or SMS.',
  },
  {
    value: 'progress_tracking',
    title: 'Track learning and progress',
    description: 'Short notes on how the child is growing and learning.',
  },
  {
    value: 'photos',
    title: 'Photos of activities',
    description: 'Pictures of the child’s artwork or activities. Never shared publicly.',
  },
];

/**
 * Consent, in the guardian's own hands: the practitioner reads the choices aloud, the guardian
 * receives a PIN on their phone, and reads it back. Then — and only then — the child is added.
 */
export function ConsentScreen({
  childName,
  guardianName,
  onSendPin,
  onConfirm,
  addAnotherHref = '/children/add',
  doneHref = '/children',
  renderLink = defaultRenderLink,
}: {
  childName: string;
  guardianName?: string;
  onSendPin: () => Promise<{ sentTo: string } | { error: string }>;
  onConfirm: Submit<{ purposes: ConsentPurpose[]; code: string }>;
  addAnotherHref?: string;
  doneHref?: string;
  renderLink?: RenderLink;
}) {
  const [stage, setStage] = useState<'choose' | 'pin' | 'done'>('choose');
  const [purposes, setPurposes] = useState<ConsentPurpose[]>(['child_record', 'parent_messages']);
  const [sentTo, setSentTo] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const who = guardianName ?? 'the parent or caregiver';

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await onSendPin();
      if ('error' in r) setError(r.error);
      else {
        setSentTo(r.sentTo);
        setStage('pin');
        setCode('');
      }
    } catch {
      setError('Something went wrong. Check your signal and try again.');
    } finally {
      setBusy(false);
    }
  };

  const confirm = async (value: string) => {
    setBusy(true);
    setError(null);
    try {
      const err = await onConfirm({ purposes, code: value });
      if (err) setError(err);
      else setStage('done');
    } catch {
      setError('Something went wrong. Check your signal and try again.');
    } finally {
      setBusy(false);
    }
  };

  if (stage === 'done') {
    return (
      <AppShell active="children" renderLink={renderLink}>
        <main className="flex min-h-[80dvh] flex-col items-center justify-center px-6 text-center">
          <Celebration className="w-48" />
          <h1 className="mt-3 text-[1.75rem] leading-tight font-black text-ink">
            {childName} is in your register
          </h1>
          <p className="mt-2 text-ink-muted">
            Consent is saved with the date and time. {who} can change their mind at any time.
          </p>
          <div className="mt-8 grid w-full gap-3">
            {renderLink({
              href: doneHref,
              className: buttonClass({ size: 'lg', block: true }),
              children: 'Back to children',
            })}
            {renderLink({
              href: addAnotherHref,
              className: buttonClass({ variant: 'secondary', size: 'lg', block: true }),
              children: 'Add another child',
            })}
          </div>
        </main>
      </AppShell>
    );
  }

  return (
    <AppShell active="children" renderLink={renderLink}>
      <PageHeader
        title={`Consent for ${childName}`}
        subtitle={`Read these to ${who}. They choose.`}
      />
      <main className="space-y-5 px-4 pb-6">
        {stage === 'choose' && (
          <>
            <div className="space-y-3">
              {PURPOSES.map((p) => (
                <CheckRow
                  key={p.value}
                  title={p.title}
                  description={p.description}
                  checked={purposes.includes(p.value)}
                  disabled={p.required}
                  onChange={(on) =>
                    setPurposes((cur) =>
                      on ? [...cur, p.value] : cur.filter((v) => v !== p.value),
                    )
                  }
                />
              ))}
            </div>
            <FormError message={error} />
            <Button size="lg" block disabled={busy} onClick={send} icon={<SendIcon size={20} />}>
              {busy ? 'Sending…' : `Send a PIN to ${guardianName ?? 'them'}`}
            </Button>
            <p className="text-center text-sm text-ink-muted">
              No phone signal for them? A signed paper form works too (coming soon).
            </p>
          </>
        )}

        {stage === 'pin' && (
          <form
            className="space-y-5"
            onSubmit={(e) => {
              e.preventDefault();
              void confirm(code);
            }}
          >
            <Card tone="brand">
              <p className="font-extrabold text-ink">Ask {who} to read you the PIN.</p>
              <p className="mt-1 text-sm text-ink-muted">
                We sent it to <span className="font-extrabold text-ink">{sentTo}</span>. Entering it
                shows they agree.
              </p>
            </Card>
            <PinInput
              label="PIN from the parent or caregiver"
              value={code}
              onChange={setCode}
              onComplete={(v) => void confirm(v)}
              invalid={Boolean(error)}
              disabled={busy}
              autoFocus
            />
            <FormError message={error} />
            <Button
              type="submit"
              size="lg"
              block
              variant="success"
              disabled={busy || code.length !== 6}
            >
              {busy ? 'Saving…' : 'Confirm consent'}
            </Button>
            <Button variant="ghost" block disabled={busy} onClick={send}>
              Send the PIN again
            </Button>
          </form>
        )}
      </main>
    </AppShell>
  );
}
