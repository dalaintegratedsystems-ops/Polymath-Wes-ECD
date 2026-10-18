'use client';

import { useState, type FormEvent } from 'react';
import { ChoiceChips, Field, FormError, TextInput } from '../forms';
import { BookIcon, CheckIcon, LeafIcon, PrinterIcon, SparkleIcon } from '../icons';
import { SproutBook } from '../illustrations';
import { DownloadForm } from '../download';
import { defaultRenderLink, type RenderLink } from '../nav';
import { Button, Card, Chip, buttonClass, cx } from '../primitives';
import { AppShell, PageHeader } from '../shell';

type Result = Promise<string | null>;

export interface PlannerActivity {
  id: string;
  slot: string;
  title: string;
  durationMinutes: number;
  ages: string[];
  eldas: string[];
  materials: string[];
  steps: string[];
  printable: 'flashcards' | 'tracing' | 'counting' | null;
}

export interface PlannerPlan {
  id: string;
  theme: string;
  status: 'draft' | 'approved' | 'archived';
  source: 'wes' | 'library';
  days: { key: string; short: string; activities: PlannerActivity[] }[];
  themeWords: string[];
  citations: { n: number; source: string; where: string }[];
}

export interface Adapted {
  title: string;
  steps: string[];
  materials: string[];
  note: string;
}

const ADAPT = [
  { value: 'younger', label: 'Younger' },
  { value: 'older', label: 'Older' },
  { value: 'outdoor', label: 'Outside' },
  { value: 'fewer_materials', label: 'Fewer materials' },
] as const;

const PRINT_LABEL = {
  flashcards: 'word cards',
  tracing: 'tracing sheet',
  counting: 'counting sheet',
};

/** A plain form post: the server answers with the PDF download. */
function PrintForm({
  action,
  kind,
  title,
  words,
  label,
  variant = 'secondary',
}: {
  action: string;
  kind: 'flashcards' | 'tracing' | 'counting';
  title: string;
  words: string[];
  label: string;
  variant?: 'primary' | 'secondary';
}) {
  return (
    <DownloadForm
      action={action}
      fields={{ kind, title, words: words.join(',') }}
      filename={`${kind}.pdf`}
      label={label}
      icon={<PrinterIcon size={18} />}
      variant={variant}
    />
  );
}

function ActivityCard({
  a,
  canEdit,
  theme,
  themeWords,
  printAction,
  onAdapt,
}: {
  a: PlannerActivity;
  canEdit: boolean;
  theme: string;
  themeWords: string[];
  printAction: string;
  onAdapt: (target: string) => Promise<Adapted | { error: string }>;
}) {
  const [open, setOpen] = useState(false);
  const [adapted, setAdapted] = useState<Adapted | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const shown = adapted ?? a;

  const adapt = async (target: string) => {
    setBusy(target);
    setError(null);
    const res = await onAdapt(target).catch(() => ({ error: 'Something went wrong. Try again.' }));
    setBusy(null);
    if ('error' in res) setError(res.error);
    else {
      setAdapted(res);
      setOpen(true);
    }
  };

  return (
    <Card>
      <div className="flex items-start gap-3">
        <span className="mt-0.5 rounded-md bg-sunk px-2 py-1 text-xs font-extrabold text-ink-muted">
          {a.durationMinutes} min
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-extrabold tracking-wide text-ink-muted uppercase">{a.slot}</p>
          <h3 className="font-black text-ink">{shown.title}</h3>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {a.eldas.map((e) => (
              <Chip key={e} tone="accent">
                {e}
              </Chip>
            ))}
            {a.ages.map((g) => (
              <Chip key={g}>{g}</Chip>
            ))}
          </div>
          {shown.materials.length > 0 && (
            <p className="mt-2 flex items-start gap-1.5 text-sm text-ink-muted">
              <LeafIcon size={16} className="mt-0.5 shrink-0 text-success" />
              <span>
                <span className="font-extrabold text-success">Free materials:</span>{' '}
                {shown.materials.join(', ')}
              </span>
            </p>
          )}
          <button
            type="button"
            className="mt-2 inline-flex min-h-touch items-center text-sm font-extrabold text-primary"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
          >
            {open ? 'Hide steps' : 'Show steps'}
          </button>
          {open && (
            <ol className="mt-1 list-decimal space-y-1.5 pl-5 text-ink">
              {shown.steps.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
          )}
          {adapted && (
            <p className="mt-2 rounded-md bg-brand-soft px-3 py-2 text-sm text-ink">
              <span className="font-extrabold">Tip:</span> {adapted.note}{' '}
              <button
                type="button"
                className="font-extrabold text-primary"
                onClick={() => setAdapted(null)}
              >
                Show the original
              </button>
            </p>
          )}
          {canEdit && (
            <div className="mt-3">
              <p className="text-sm font-extrabold text-ink">Adapt this activity</p>
              <div className="mt-1 flex flex-wrap gap-2">
                {ADAPT.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    disabled={busy !== null}
                    onClick={() => void adapt(t.value)}
                    className="inline-flex min-h-10 items-center rounded-full border-2 border-line bg-surface px-3 text-sm font-extrabold text-ink disabled:opacity-50"
                  >
                    {busy === t.value ? 'Adapting…' : t.label}
                  </button>
                ))}
              </div>
              <FormError message={error} />
            </div>
          )}
          {a.printable && (themeWords.length > 0 || a.printable === 'counting') && (
            <div className="mt-3">
              <PrintForm
                action={printAction}
                kind={a.printable}
                title={`${theme}: ${PRINT_LABEL[a.printable]}`}
                words={themeWords}
                label={`Print the ${PRINT_LABEL[a.printable]}`}
              />
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

export function PlannerScreen({
  weekLabel,
  weekStarting,
  plan,
  todayKey,
  canEdit,
  ageOptions,
  printAction,
  onCreate,
  onApprove,
  onAdapt,
  renderLink = defaultRenderLink,
}: {
  weekLabel: string;
  weekStarting: string;
  plan: PlannerPlan | null;
  todayKey?: string;
  canEdit: boolean;
  ageOptions: { value: string; label: string }[];
  printAction: string;
  onCreate: (v: { theme: string; ageGroups: string[]; weekStarting: string }) => Result;
  onApprove: () => Result;
  onAdapt: (activityId: string, target: string) => Promise<Adapted | { error: string }>;
  renderLink?: RenderLink;
}) {
  const [making, setMaking] = useState(!plan);
  const [theme, setTheme] = useState('');
  const [ages, setAges] = useState<string[]>(ageOptions.slice(1).map((o) => o.value));
  const [day, setDay] = useState(
    plan?.days.find((d) => d.key === todayKey)?.key ?? plan?.days[0]?.key ?? 'mon',
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const current = plan?.days.find((d) => d.key === day);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const err = await onCreate({ theme: theme.trim(), ageGroups: ages, weekStarting }).catch(
      () => 'Something went wrong. Check your signal and try again.',
    );
    setBusy(false);
    if (err) setError(err);
    else setMaking(false);
  };

  const approve = async () => {
    setBusy(true);
    setError(await onApprove().catch(() => 'Something went wrong. Try again.'));
    setBusy(false);
  };

  return (
    <AppShell active="plan" renderLink={renderLink}>
      <PageHeader
        title="Weekly plan"
        subtitle={weekLabel}
        action={renderLink({
          href: '/plan/printables',
          className: buttonClass({ variant: 'secondary' }),
          children: (
            <>
              <PrinterIcon size={18} />
              Printables
            </>
          ),
        })}
      />
      <main className="space-y-4 px-4 pb-6">
        {making || !plan ? (
          canEdit ? (
            <Card>
              {!plan && <SproutBook className="mx-auto w-32" />}
              <h2 className="mt-2 text-xl font-black text-ink">
                {plan ? 'Make a new plan' : 'Plan your week with Wes'}
              </h2>
              <p className="mt-1 text-ink-muted">
                Choose a theme and your age groups. Wes drafts five days of activities with free
                materials. You can change anything.
              </p>
              <form onSubmit={create} noValidate className="mt-4 space-y-4">
                <Field
                  label="Theme"
                  hint="For example: Farm animals, Rain, My family"
                  htmlFor="theme"
                >
                  <TextInput
                    id="theme"
                    maxLength={60}
                    value={theme}
                    onChange={(e) => setTheme(e.target.value)}
                  />
                </Field>
                <ChoiceChips
                  label="Age groups"
                  multiple
                  options={ageOptions}
                  value={ages}
                  onChange={setAges}
                />
                <FormError message={error} />
                <Button
                  type="submit"
                  size="lg"
                  block
                  disabled={busy || theme.trim().length < 2 || ages.length === 0}
                  icon={<SparkleIcon size={20} />}
                >
                  {busy ? 'Planning your week…' : 'Make my plan'}
                </Button>
                {plan && (
                  <Button variant="ghost" block onClick={() => setMaking(false)}>
                    Keep the current plan
                  </Button>
                )}
              </form>
            </Card>
          ) : (
            <Card className="py-8 text-center">
              <SproutBook className="mx-auto w-40" />
              <p className="mt-3 font-black text-ink">No plan for this week yet</p>
            </Card>
          )
        ) : (
          <>
            <Card tone="brand">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-extrabold tracking-wide text-brand-strong uppercase">
                    Theme
                  </p>
                  <h2 className="text-2xl font-black text-ink">{plan.theme}</h2>
                </div>
                <Chip tone={plan.status === 'approved' ? 'success' : 'brand'}>
                  {plan.status === 'approved' ? 'Approved' : 'Draft'}
                </Chip>
              </div>
              <p className="mt-2 flex items-start gap-1.5 text-sm text-ink-muted">
                <BookIcon size={16} className="mt-0.5 shrink-0" />
                <span>
                  {plan.citations.length > 0
                    ? `Sources: ${plan.citations.map((c) => `[${c.n}] ${c.source}, ${c.where}`).join('; ')}`
                    : 'ELDA tags are suggestions. Links to the official NCF text will be added when the documents are loaded.'}
                </span>
              </p>
              {canEdit && plan.status === 'draft' && (
                <Button
                  className="mt-3"
                  variant="success"
                  block
                  disabled={busy}
                  icon={<CheckIcon size={20} />}
                  onClick={() => void approve()}
                >
                  {busy ? 'Approving…' : 'Approve this plan'}
                </Button>
              )}
              <FormError message={error} />
            </Card>

            <div role="tablist" aria-label="Day of the week" className="grid grid-cols-5 gap-2">
              {plan.days.map((d) => (
                <button
                  key={d.key}
                  role="tab"
                  type="button"
                  aria-selected={d.key === day}
                  onClick={() => setDay(d.key)}
                  className={cx(
                    'min-h-touch rounded-md text-sm font-extrabold transition-colors',
                    d.key === day
                      ? 'bg-primary text-on-primary shadow-card'
                      : 'bg-surface text-ink-muted shadow-card',
                  )}
                >
                  {d.short}
                  {d.key === todayKey && <span className="sr-only"> (today)</span>}
                </button>
              ))}
            </div>

            <ul role="tabpanel" className="space-y-3">
              {current?.activities.map((a) => (
                <li key={`${day}-${a.id}`}>
                  <ActivityCard
                    a={a}
                    canEdit={canEdit}
                    theme={plan.theme}
                    themeWords={plan.themeWords}
                    printAction={printAction}
                    onAdapt={(target) => onAdapt(a.id, target)}
                  />
                </li>
              ))}
            </ul>
            {canEdit && (
              <Button variant="ghost" block onClick={() => setMaking(true)}>
                Make a different plan for this week
              </Button>
            )}
          </>
        )}
      </main>
    </AppShell>
  );
}

export function PrintablesScreen({
  printAction,
  suggestedWords,
  renderLink = defaultRenderLink,
}: {
  printAction: string;
  suggestedWords: string[];
  renderLink?: RenderLink;
}) {
  const [kind, setKind] = useState<'flashcards' | 'tracing' | 'counting'>('flashcards');
  const [title, setTitle] = useState('');
  const [words, setWords] = useState(suggestedWords.join(', '));
  const [upTo, setUpTo] = useState('5');
  const list = words
    .split(',')
    .map((w) => w.trim())
    .filter(Boolean)
    .slice(0, 12);
  return (
    <AppShell active="plan" renderLink={renderLink}>
      <PageHeader
        title="Printables"
        subtitle="Low-ink A4 sheets, safe to photocopy in black and white."
      />
      <main className="space-y-4 px-4 pb-6">
        <Card>
          <DownloadForm
            action={printAction}
            fields={{ kind }}
            filename={`${kind}.pdf`}
            label="Make the PDF"
            icon={<PrinterIcon size={20} />}
            size="lg"
            block
            disabled={title.trim().length < 2 || (kind !== 'counting' && list.length === 0)}
          >
            <ChoiceChips
              label="What would you like to print?"
              options={[
                { value: 'flashcards', label: 'Word cards' },
                { value: 'tracing', label: 'Tracing sheet' },
                { value: 'counting', label: 'Counting sheet' },
              ]}
              value={[kind]}
              onChange={(v) => v[0] && setKind(v[0] as typeof kind)}
            />
            <Field label="Title" htmlFor="p-title">
              <TextInput
                id="p-title"
                name="title"
                maxLength={60}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </Field>
            {kind === 'counting' ? (
              <Field label="Count up to" htmlFor="p-upto">
                <TextInput
                  id="p-upto"
                  name="upTo"
                  type="number"
                  min={1}
                  max={10}
                  value={upTo}
                  onChange={(e) => setUpTo(e.target.value)}
                />
              </Field>
            ) : (
              <Field label="Words" hint="Separate words with commas, up to 12" htmlFor="p-words">
                <TextInput
                  id="p-words"
                  name="words"
                  value={words}
                  onChange={(e) => setWords(e.target.value)}
                />
              </Field>
            )}
          </DownloadForm>
        </Card>
        {renderLink({
          href: '/plan',
          className: buttonClass({ variant: 'ghost', block: true }),
          children: 'Back to the weekly plan',
        })}
      </main>
    </AppShell>
  );
}
