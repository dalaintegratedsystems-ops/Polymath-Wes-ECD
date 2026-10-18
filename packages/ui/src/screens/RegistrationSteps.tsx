'use client';

import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ChoiceChips, Field, FormError, NumberStepper, Select, TextInput } from '../forms';
import {
  ArrowRightIcon,
  CameraIcon,
  CheckIcon,
  DocumentIcon,
  PrinterIcon,
  ShieldIcon,
  SparkleIcon,
} from '../icons';
import { Celebration } from '../illustrations';
import { defaultRenderLink, type RenderLink } from '../nav';
import { Button, Card, Chip, buttonClass, cx } from '../primitives';
import { AppShell, PageHeader } from '../shell';
import { resizeImage } from './AccountScreens';

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

function StepShell({
  title,
  subtitle,
  renderLink,
  children,
}: {
  title: string;
  subtitle?: string;
  renderLink: RenderLink;
  children: ReactNode;
}) {
  return (
    <AppShell active="registration" renderLink={renderLink}>
      <PageHeader title={title} subtitle={subtitle} />
      <main className="space-y-4 px-4 pb-6">
        {children}
        {renderLink({
          href: '/registration',
          className: buttonClass({ variant: 'ghost', block: true }),
          children: 'Back to registration',
        })}
      </main>
    </AppShell>
  );
}

function PlaceholderNotice() {
  return (
    <p className="rounded-md border-2 border-dashed border-line px-4 py-3 text-sm text-ink-muted">
      This checklist is a starting outline. The official DBE requirements will be added soon, and
      Wes will then show exactly what each area needs, with sources.
    </p>
  );
}

// ---------- Self-audit ----------

export interface AuditItem {
  code: string;
  title: string;
  guidance: string;
  placeholder: boolean;
}

export interface AuditGapView {
  code: string;
  title: string;
  answer: 'no' | 'unsure';
  priority: number;
  action: string;
}

const ANSWERS = [
  { value: 'yes' as const, label: 'Yes' },
  { value: 'no' as const, label: 'Not yet' },
  { value: 'unsure' as const, label: 'Not sure' },
];

export function SelfAuditScreen({
  items,
  isPlaceholder,
  latest,
  canRun,
  onSubmit,
  renderLink = defaultRenderLink,
}: {
  items: AuditItem[];
  isPlaceholder: boolean;
  latest: { scorePercent: number; gaps: AuditGapView[]; createdAt: string } | null;
  canRun: boolean;
  onSubmit: (answers: Record<string, 'yes' | 'no' | 'unsure'>) => Result;
  renderLink?: RenderLink;
}) {
  const [answers, setAnswers] = useState<Record<string, 'yes' | 'no' | 'unsure'>>({});
  const [redo, setRedo] = useState(!latest);
  const { busy, error, run } = useBusy();
  const left = items.filter((i) => !answers[i.code]).length;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const err = await onSubmit(answers);
      if (!err) setRedo(false);
      return err;
    });
  };

  return (
    <StepShell
      title="Check where you stand"
      subtitle="A few quick questions so Wes can see what is missing."
      renderLink={renderLink}
    >
      {isPlaceholder && <PlaceholderNotice />}
      {latest && !redo ? (
        <>
          <Card tone="brand">
            <p className="text-sm font-extrabold text-brand-strong">Your result</p>
            <p className="mt-1 text-[2rem] leading-none font-black text-ink">
              {latest.scorePercent}%
            </p>
            <p className="mt-1 text-ink-muted">
              {latest.gaps.length === 0
                ? 'Everything on the checklist is in place. Well done!'
                : `${latest.gaps.length} ${latest.gaps.length === 1 ? 'thing' : 'things'} to work on, most urgent first.`}
            </p>
          </Card>
          {latest.gaps.length > 0 && (
            <ol className="space-y-3" aria-label="Things to work on">
              {latest.gaps.map((g) => (
                <li key={g.code}>
                  <Card>
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-black text-ink">{g.title}</p>
                      <Chip tone={g.priority === 1 ? 'accent' : 'neutral'}>
                        {g.priority === 1
                          ? 'Do first'
                          : g.answer === 'unsure'
                            ? 'Find out'
                            : 'Next'}
                      </Chip>
                    </div>
                    <p className="mt-1 text-sm text-ink-muted">{g.action}</p>
                  </Card>
                </li>
              ))}
            </ol>
          )}
          {renderLink({
            href: `/wes?q=${encodeURIComponent('What should I do first for my registration?')}`,
            className: buttonClass({ variant: 'secondary', block: true }),
            children: (
              <>
                <SparkleIcon size={20} />
                Ask Wes what to do first
              </>
            ),
          })}
          {canRun && (
            <Button variant="ghost" block onClick={() => setRedo(true)}>
              Answer the questions again
            </Button>
          )}
        </>
      ) : canRun ? (
        <form onSubmit={submit} noValidate className="space-y-3">
          {items.map((item, i) => (
            <Card key={item.code}>
              <ChoiceChips
                label={`${i + 1}. ${item.title}`}
                options={ANSWERS}
                value={answers[item.code] ? [answers[item.code]!] : []}
                onChange={(v) => v[0] && setAnswers((a) => ({ ...a, [item.code]: v[0]! }))}
              />
              {!item.placeholder && <p className="mt-2 text-sm text-ink-muted">{item.guidance}</p>}
            </Card>
          ))}
          <FormError message={error} />
          <Button type="submit" size="lg" block disabled={busy || left > 0}>
            {busy ? 'Checking…' : left > 0 ? `${left} questions left` : 'See my result'}
          </Button>
        </form>
      ) : (
        <Card>
          <p className="text-ink-muted">Your principal has not done the self-audit yet.</p>
        </Card>
      )}
    </StepShell>
  );
}

// ---------- Centre details ----------

export interface CentreDetailsDraft {
  addressLine: string;
  suburb: string;
  city: string;
  childCount: number;
  agesServedMinMonths: number;
  agesServedMaxMonths: number;
}

export function CentreDetailsScreen({
  initial,
  canEdit,
  onSave,
  renderLink = defaultRenderLink,
}: {
  initial: CentreDetailsDraft & { name: string };
  canEdit: boolean;
  onSave: (d: CentreDetailsDraft) => Result;
  renderLink?: RenderLink;
}) {
  const [d, setD] = useState<CentreDetailsDraft>(initial);
  const [saved, setSaved] = useState(false);
  const { busy, error, run } = useBusy();
  const set = <K extends keyof CentreDetailsDraft>(k: K, v: CentreDetailsDraft[K]) => {
    setSaved(false);
    setD((x) => ({ ...x, [k]: v }));
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const err = await onSave(d);
      setSaved(!err);
      return err;
    });
  };
  return (
    <StepShell title="Centre details" subtitle={initial.name} renderLink={renderLink}>
      <form onSubmit={submit} noValidate className="space-y-4">
        <Field label="Street address" htmlFor="addr">
          <TextInput
            id="addr"
            value={d.addressLine}
            disabled={!canEdit}
            onChange={(e) => set('addressLine', e.target.value)}
          />
        </Field>
        <Field label="Suburb or township" htmlFor="suburb">
          <TextInput
            id="suburb"
            value={d.suburb}
            disabled={!canEdit}
            onChange={(e) => set('suburb', e.target.value)}
          />
        </Field>
        <Field label="Town or city" htmlFor="city">
          <TextInput
            id="city"
            value={d.city}
            disabled={!canEdit}
            onChange={(e) => set('city', e.target.value)}
          />
        </Field>
        <NumberStepper
          label="How many children come to your centre?"
          value={d.childCount}
          min={0}
          max={500}
          onChange={(v) => set('childCount', v)}
        />
        <FormError message={error} />
        {saved && (
          <p role="status" className="flex items-center gap-2 font-bold text-success">
            <CheckIcon size={20} /> Saved
          </p>
        )}
        {canEdit && (
          <Button
            type="submit"
            size="lg"
            block
            disabled={busy || !d.addressLine.trim() || !d.city.trim()}
          >
            {busy ? 'Saving…' : 'Save details'}
          </Button>
        )}
      </form>
    </StepShell>
  );
}

// ---------- Policies ----------

export type PolicyKindId = 'admissions' | 'health' | 'safety' | 'child_protection';

export interface PolicySummary {
  kind: PolicyKindId;
  title: string;
  status: 'missing' | 'draft' | 'approved';
}

export function PoliciesScreen({
  policies,
  renderLink = defaultRenderLink,
}: {
  policies: PolicySummary[];
  renderLink?: RenderLink;
}) {
  const approved = policies.filter((p) => p.status === 'approved').length;
  return (
    <StepShell
      title="Write your policies"
      subtitle={`${approved} of ${policies.length} approved. Wes drafts them from your answers.`}
      renderLink={renderLink}
    >
      <ul className="space-y-3">
        {policies.map((p) => (
          <li key={p.kind}>
            {renderLink({
              href: `/registration/policies/${p.kind}`,
              className:
                'flex min-h-touch-lg items-center gap-3 rounded-lg bg-surface p-4 shadow-card',
              children: (
                <>
                  <span
                    className={cx(
                      'grid size-10 shrink-0 place-items-center rounded-full',
                      p.status === 'approved'
                        ? 'bg-success text-on-success'
                        : 'bg-brand-soft text-brand-strong',
                    )}
                  >
                    {p.status === 'approved' ? <CheckIcon size={20} /> : <DocumentIcon size={20} />}
                  </span>
                  <span className="flex-1">
                    <span className="block font-black text-ink">{p.title}</span>
                    <span className="block text-sm text-ink-muted">
                      {p.status === 'approved'
                        ? 'Approved'
                        : p.status === 'draft'
                          ? 'Draft: check and approve'
                          : 'Not started'}
                    </span>
                  </span>
                  <ArrowRightIcon size={20} className="text-primary" />
                </>
              ),
            })}
          </li>
        ))}
      </ul>
    </StepShell>
  );
}

export interface PolicyQuestionView {
  id: string;
  label: string;
  hint?: string;
  type: 'text' | 'textarea' | 'choice';
  options?: { value: string; label: string }[];
  required: boolean;
}

export interface PolicyView {
  id: string;
  title: string;
  status: 'draft' | 'approved' | 'archived';
  bodyMarkdown: string;
  approvedAt: string | null;
}

export function PolicyScreen({
  title,
  questions,
  initialAnswers,
  policy,
  canEdit,
  canApprove,
  pdfHref,
  onGenerate,
  onSaveText,
  onApprove,
  renderLink = defaultRenderLink,
}: {
  title: string;
  questions: PolicyQuestionView[];
  initialAnswers: Record<string, string>;
  policy: PolicyView | null;
  canEdit: boolean;
  canApprove: boolean;
  pdfHref: string | null;
  onGenerate: (answers: Record<string, string>) => Result;
  onSaveText: (body: string) => Result;
  onApprove: () => Result;
  renderLink?: RenderLink;
}) {
  const [answers, setAnswers] = useState(initialAnswers);
  const [mode, setMode] = useState<'questions' | 'draft'>(policy ? 'draft' : 'questions');
  const [text, setText] = useState(policy?.bodyMarkdown ?? '');
  const { busy, error, run } = useBusy();
  const missing = questions.filter((q) => q.required && !answers[q.id]?.trim()).length;
  const changed = policy !== null && text !== policy.bodyMarkdown;

  const generate = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const err = await onGenerate(answers);
      if (!err) setMode('draft');
      return err;
    });
  };

  return (
    <StepShell title={title} renderLink={renderLink}>
      {mode === 'questions' || !policy ? (
        canEdit ? (
          <form onSubmit={generate} noValidate className="space-y-4">
            <p className="text-ink-muted">
              Answer in your own words. Wes turns your answers into a draft you can change.
            </p>
            {questions.map((q) => (
              <Card key={q.id}>
                {q.type === 'choice' ? (
                  <ChoiceChips
                    label={q.label}
                    options={q.options ?? []}
                    value={answers[q.id] ? [answers[q.id]!] : []}
                    onChange={(v) => setAnswers((a) => ({ ...a, [q.id]: v[0] ?? '' }))}
                  />
                ) : (
                  <Field
                    label={`${q.label}${q.required ? '' : ' (optional)'}`}
                    hint={q.hint}
                    htmlFor={`q-${q.id}`}
                  >
                    {q.type === 'textarea' ? (
                      <textarea
                        id={`q-${q.id}`}
                        rows={3}
                        maxLength={1000}
                        value={answers[q.id] ?? ''}
                        onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                        className="block w-full rounded-md border-2 border-line bg-surface px-4 py-3 text-lg text-ink focus:border-primary focus:outline-none"
                      />
                    ) : (
                      <TextInput
                        id={`q-${q.id}`}
                        maxLength={1000}
                        value={answers[q.id] ?? ''}
                        onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                      />
                    )}
                  </Field>
                )}
              </Card>
            ))}
            <FormError message={error} />
            <Button
              type="submit"
              size="lg"
              block
              disabled={busy || missing > 0}
              icon={<SparkleIcon size={20} />}
            >
              {busy
                ? 'Writing your draft…'
                : missing > 0
                  ? `${missing} answers needed`
                  : 'Write my draft'}
            </Button>
          </form>
        ) : (
          <Card>
            <p className="text-ink-muted">Your principal has not started this policy yet.</p>
          </Card>
        )
      ) : (
        <>
          <Card
            tone={policy.status === 'approved' ? 'surface' : 'brand'}
            className="flex items-start gap-3"
          >
            <ShieldIcon size={22} className="mt-0.5 shrink-0 text-success" />
            <p className="text-sm text-ink">
              {policy.status === 'approved'
                ? `Approved on ${policy.approvedAt?.slice(0, 10)}. It is part of your application pack.`
                : 'This is a draft. Read it carefully, change anything that is not right for your centre, then approve it.'}
            </p>
          </Card>
          <Field
            label="Policy text"
            hint="Lines starting with ## are headings. Lines starting with - are bullet points."
            htmlFor="policy-text"
          >
            <textarea
              id="policy-text"
              rows={18}
              value={text}
              readOnly={!canEdit}
              onChange={(e) => setText(e.target.value)}
              className="block w-full rounded-md border-2 border-line bg-surface px-4 py-3 font-[inherit] text-base leading-relaxed text-ink focus:border-primary focus:outline-none"
            />
          </Field>
          <FormError message={error} />
          <div className="grid gap-3">
            {changed && canEdit && (
              <Button
                size="lg"
                block
                disabled={busy}
                onClick={() => void run(() => onSaveText(text))}
              >
                {busy ? 'Saving…' : 'Save my changes'}
              </Button>
            )}
            {!changed && canApprove && policy.status === 'draft' && (
              <Button
                size="lg"
                block
                variant="success"
                disabled={busy}
                icon={<CheckIcon size={20} />}
                onClick={() => void run(onApprove)}
              >
                {busy ? 'Approving…' : 'Approve this policy'}
              </Button>
            )}
            {pdfHref && (
              <a href={pdfHref} className={buttonClass({ variant: 'secondary', block: true })}>
                <PrinterIcon size={20} />
                Open as PDF
              </a>
            )}
            {canEdit && (
              <Button variant="ghost" block onClick={() => setMode('questions')}>
                Change my answers and redraft
              </Button>
            )}
          </div>
        </>
      )}
    </StepShell>
  );
}

// ---------- Documents ----------

export interface DocumentView {
  id: string;
  typeLabel: string;
  expiresOn: string | null;
  expiry: 'none' | 'ok' | 'soon' | 'expired';
  isPdf: boolean;
  href: string;
}

const EXPIRY_CHIP = {
  none: { tone: 'neutral', label: 'No expiry date' },
  ok: { tone: 'success', label: 'Valid' },
  soon: { tone: 'accent', label: 'Renew soon' },
  expired: { tone: 'accent', label: 'Expired' },
} as const;

export function DocumentsScreen({
  documents,
  types,
  canEdit,
  onUpload,
  onDelete,
  renderLink = defaultRenderLink,
}: {
  documents: DocumentView[];
  types: { value: string; label: string }[];
  canEdit: boolean;
  onUpload: (form: FormData) => Result;
  onDelete: (id: string) => Result;
  renderLink?: RenderLink;
}) {
  const [type, setType] = useState(types[0]?.value ?? 'other');
  const [expires, setExpires] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const { busy, error, run } = useBusy();

  const upload = (e: FormEvent) => {
    e.preventDefault();
    if (!file) return;
    void run(async () => {
      const form = new FormData();
      form.set('type', type);
      if (expires) form.set('expiresOn', expires);
      if (file.type === 'application/pdf') {
        form.set('file', file, file.name);
      } else {
        // Phone photos are large: shrink before sending (saves data; removes location too).
        const blob = await resizeImage(file, 1600).catch(() => null);
        if (!blob) return 'We could not read that photo. Try another one.';
        form.set('file', blob, 'document.jpg');
      }
      const err = await onUpload(form);
      if (!err) {
        setFile(null);
        setExpires('');
        if (input.current) input.current.value = '';
      }
      return err;
    });
  };

  return (
    <StepShell
      title="Your documents"
      subtitle="Photograph letters and certificates. Wes reminds you before anything expires."
      renderLink={renderLink}
    >
      {canEdit && (
        <Card>
          <h2 className="font-black text-ink">Add a document</h2>
          <form onSubmit={upload} noValidate className="mt-3 space-y-4">
            <Field label="What is it?" htmlFor="doc-type">
              <Select id="doc-type" value={type} onChange={(e) => setType(e.target.value)}>
                {types.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Expiry date (if it has one)" htmlFor="doc-expiry">
              <TextInput
                id="doc-expiry"
                type="date"
                value={expires}
                onChange={(e) => setExpires(e.target.value)}
              />
            </Field>
            <div>
              <input
                ref={input}
                id="doc-file"
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                capture="environment"
                className="sr-only"
                aria-label="Take a photo or choose a file"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              <Button
                variant="secondary"
                block
                icon={<CameraIcon size={20} />}
                onClick={() => input.current?.click()}
              >
                {file ? `Chosen: ${file.name}` : 'Take a photo or choose a file'}
              </Button>
            </div>
            <FormError message={error} />
            <Button type="submit" size="lg" block disabled={busy || !file}>
              {busy ? 'Saving…' : 'Save document'}
            </Button>
          </form>
        </Card>
      )}

      {documents.length === 0 ? (
        <Card>
          <p className="text-ink-muted">No documents yet.</p>
        </Card>
      ) : (
        <ul className="space-y-3" aria-label="Saved documents">
          {documents.map((d) => (
            <li key={d.id}>
              <Card>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-black text-ink">{d.typeLabel}</p>
                    <p className="text-sm text-ink-muted">
                      {d.expiresOn ? `Expires ${d.expiresOn}` : 'No expiry date'}
                    </p>
                  </div>
                  <Chip tone={EXPIRY_CHIP[d.expiry].tone}>{EXPIRY_CHIP[d.expiry].label}</Chip>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <a
                    href={d.href}
                    className={buttonClass({ variant: 'secondary' })}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <DocumentIcon size={18} />
                    Open
                  </a>
                  {canEdit && (
                    <Button
                      variant="ghost"
                      onClick={() => {
                        if (window.confirm(`Remove this ${d.typeLabel.toLowerCase()}?`))
                          void run(() => onDelete(d.id));
                      }}
                    >
                      Remove
                    </Button>
                  )}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </StepShell>
  );
}

// ---------- Application pack and submission ----------

export function PackScreen({
  checks,
  canBuild,
  downloadAction,
  builtAt,
  renderLink = defaultRenderLink,
}: {
  checks: { label: string; ok: boolean; href: string }[];
  canBuild: boolean;
  /** A route that answers a POST with the PDF. */
  downloadAction: string;
  builtAt: string | null;
  renderLink?: RenderLink;
}) {
  const ready = checks.every((c) => c.ok);
  return (
    <StepShell
      title="Your application pack"
      subtitle="One PDF with your centre details, self-audit, approved policies and documents."
      renderLink={renderLink}
    >
      <Card>
        <ul className="space-y-3">
          {checks.map((c) => (
            <li key={c.label} className="flex items-center gap-3">
              <span
                className={cx(
                  'grid size-8 shrink-0 place-items-center rounded-full',
                  c.ok ? 'bg-success text-on-success' : 'border-2 border-line text-ink-muted',
                )}
              >
                {c.ok ? <CheckIcon size={18} /> : '!'}
              </span>
              <span className="flex-1 font-bold text-ink">{c.label}</span>
              {!c.ok &&
                renderLink({
                  href: c.href,
                  className: 'text-sm font-extrabold text-primary',
                  children: 'Fix',
                })}
            </li>
          ))}
        </ul>
      </Card>
      {!ready && (
        <p className="text-sm text-ink-muted">
          You can make the pack now and again later: anything missing is marked inside it.
        </p>
      )}
      {canBuild ? (
        <form method="post" action={downloadAction}>
          <button type="submit" className={buttonClass({ size: 'lg', block: true })}>
            <PrinterIcon size={20} />
            {builtAt ? 'Make a fresh pack (PDF)' : 'Make my pack (PDF)'}
          </button>
        </form>
      ) : (
        <Card>
          <p className="text-ink-muted">Your principal makes the application pack.</p>
        </Card>
      )}
      {builtAt && <p className="text-center text-sm text-ink-muted">Last made on {builtAt}.</p>}
    </StepShell>
  );
}

export function SubmitScreen({
  submitted,
  canSubmit,
  onMarkSubmitted,
  renderLink = defaultRenderLink,
}: {
  submitted: boolean;
  canSubmit: boolean;
  onMarkSubmitted: () => Result;
  renderLink?: RenderLink;
}) {
  const { busy, error, run } = useBusy();
  return (
    <StepShell title="Submit to your district office" renderLink={renderLink}>
      {submitted ? (
        <Card className="text-center">
          <Celebration className="mx-auto w-44" />
          <p className="mt-2 text-xl font-black text-ink">Submitted. Well done!</p>
          <p className="mt-1 text-ink-muted">
            Wes keeps reminding you about documents that expire.
          </p>
        </Card>
      ) : (
        <>
          <Card>
            <ol className="list-decimal space-y-2 pl-5 text-ink">
              <li>Print your application pack, or save it on your phone.</li>
              <li>
                Ask your district ECD office how they want to receive it, and take it to them.
              </li>
              <li>Come back here and tell Wes you have submitted it.</li>
            </ol>
          </Card>
          {renderLink({
            href: `/wes?q=${encodeURIComponent('How do I submit my registration application to my district office?')}`,
            className: buttonClass({ variant: 'secondary', block: true }),
            children: (
              <>
                <SparkleIcon size={20} />
                Ask Wes about submitting
              </>
            ),
          })}
          <FormError message={error} />
          {canSubmit && (
            <Button size="lg" block disabled={busy} onClick={() => void run(onMarkSubmitted)}>
              {busy ? 'Saving…' : 'I have submitted my application'}
            </Button>
          )}
        </>
      )}
    </StepShell>
  );
}
