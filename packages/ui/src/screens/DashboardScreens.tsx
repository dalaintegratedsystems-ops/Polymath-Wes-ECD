import type { ReactNode } from 'react';
import { ChartIcon, DownloadIcon, PeopleIcon, SparkleIcon } from '../icons';
import { defaultRenderLink, type RenderLink } from '../nav';
import { buttonClass, Card, Chip, cx } from '../primitives';
import { AppShell, PageHeader } from '../shell';

/**
 * Dashboards. Hand-drawn SVG charts (no chart library: protects the 170 KB budget), numbers
 * explained in plain sentences, and every chart has a text equivalent for screen readers.
 */

// ---------- Small building blocks ----------

/** A tiny line chart. `values` may contain nulls (no data that week): the line breaks there. */
export function Sparkline({
  values,
  label,
  width = 280,
  height = 56,
  className,
}: {
  values: (number | null)[];
  label: string;
  width?: number;
  height?: number;
  className?: string;
}) {
  const nums = values.filter((v): v is number => v !== null);
  const max = Math.max(1, ...nums);
  const step = values.length > 1 ? width / (values.length - 1) : width;
  const y = (v: number) => height - 4 - (v / max) * (height - 8);
  let d = '';
  values.forEach((v, i) => {
    if (v === null) return;
    const prevMissing = i === 0 || values[i - 1] === null;
    d += `${prevMissing ? 'M' : 'L'}${(i * step).toFixed(1)},${y(v).toFixed(1)} `;
  });
  const lastIndex = values.findLastIndex((v) => v !== null);
  const last = lastIndex >= 0 ? values[lastIndex] : null;
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={cx('block h-14 w-full overflow-visible', className)}
      role="img"
      aria-label={label}
      preserveAspectRatio="none"
    >
      <line
        x1="0"
        x2={width}
        y1={height - 4}
        y2={height - 4}
        className="stroke-line"
        strokeWidth="1"
      />
      <path
        d={d}
        fill="none"
        className="stroke-primary"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      {last !== null && last !== undefined && (
        <circle cx={lastIndex * step} cy={y(last)} r="4" className="fill-primary" />
      )}
    </svg>
  );
}

/** Horizontal bars for "how many in each group" questions. */
export function BarList({
  items,
  empty = 'Nothing yet',
  format = (n: number) => String(n),
}: {
  items: { label: string; count: number }[];
  empty?: string;
  format?: (n: number) => string;
}) {
  if (items.length === 0) return <p className="text-sm text-ink-muted">{empty}</p>;
  const max = Math.max(1, ...items.map((i) => i.count));
  return (
    <ul className="space-y-2">
      {items.map((i) => (
        <li key={i.label}>
          <div className="flex justify-between gap-3 text-sm">
            <span className="font-bold text-ink">{i.label}</span>
            <span className="font-extrabold tabular-nums text-ink">{format(i.count)}</span>
          </div>
          <div className="mt-1 h-2.5 rounded-full bg-sunk" aria-hidden="true">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${Math.max(4, (i.count / max) * 100)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

function Stat({
  label,
  value,
  note,
  tone = 'surface',
}: {
  label: string;
  value: ReactNode;
  note?: ReactNode;
  tone?: 'surface' | 'brand';
}) {
  return (
    <Card tone={tone} className="min-w-0">
      <p className="text-xs font-extrabold tracking-wide text-ink-muted uppercase">{label}</p>
      <p className="mt-1 text-[1.75rem] leading-none font-black tabular-nums text-ink">{value}</p>
      {note && <p className="mt-1.5 text-sm text-ink-muted">{note}</p>}
    </Card>
  );
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "up from 7" / "down from 9" / "the same as last week" in plain words. */
export function trendSentence(current: number, previous: number): string {
  if (current === previous) return 'the same as the week before';
  return `${current > previous ? 'up' : 'down'} from ${previous} the week before`;
}

const STATUS_LABEL: Record<string, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  submitted: 'Submitted',
  conditionally_registered: 'Conditionally registered',
  registered: 'Registered',
};
export const registrationLabel = (s: string | null) => (s ? (STATUS_LABEL[s] ?? s) : 'Unknown');

const formatDay = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' });

// ---------- Centre dashboard ----------

export interface CentreDashboardData {
  from: string;
  to: string;
  centreName: string;
  registrationStatus: string;
  childrenActive: number;
  awaitingConsent: number;
  consentsGranted: number;
  staff: number;
  parentsLinked: number;
  wesQuestions: number;
  wesHelpful: number;
  wesNotHelpful: number;
  attendanceRate: number | null;
  weekly: {
    weekStart: string;
    wesQuestions: number;
    childrenAdded: number;
    attendanceRate: number | null;
  }[];
}

const RANGES = [
  { days: 7, label: '7 days' },
  { days: 28, label: '4 weeks' },
  { days: 90, label: '3 months' },
];

export function CentreDashboardScreen({
  data,
  rangeDays,
  canManagePeople = false,
  renderLink = defaultRenderLink,
}: {
  data: CentreDashboardData;
  rangeDays: number;
  canManagePeople?: boolean;
  renderLink?: RenderLink;
}) {
  const weeks = data.weekly;
  const thisWeek = weeks.at(-1)?.wesQuestions ?? 0;
  const lastWeek = weeks.at(-2)?.wesQuestions ?? 0;
  const feedbackTotal = data.wesHelpful + data.wesNotHelpful;
  const helpfulPct = feedbackTotal > 0 ? Math.round((data.wesHelpful / feedbackTotal) * 100) : null;

  return (
    <AppShell active="home" renderLink={renderLink}>
      <PageHeader
        title="Your progress"
        subtitle={`${data.centreName}, ${formatDay(data.from)} to ${formatDay(data.to)}`}
      />
      <main className="space-y-5 px-4 pb-6">
        <nav aria-label="Time range" className="flex gap-2">
          {RANGES.map((r) =>
            renderLink({
              href: `/dashboard?days=${r.days}`,
              className: cx(
                'inline-flex min-h-touch items-center rounded-full px-4 text-sm font-extrabold',
                r.days === rangeDays
                  ? 'bg-ink text-canvas'
                  : 'border-2 border-line bg-surface text-ink',
              ),
              ...(r.days === rangeDays ? { 'aria-current': 'page' as const } : {}),
              children: r.label,
            }),
          )}
        </nav>

        <Card tone="brand">
          <div className="flex items-center gap-2">
            <span className="grid size-9 place-items-center rounded-full bg-primary text-on-primary">
              <SparkleIcon size={18} />
            </span>
            <h2 className="text-lg font-black text-ink">Wes this week</h2>
          </div>
          <p className="mt-2 text-ink">
            Wes answered{' '}
            <span className="font-black">{plural(thisWeek, 'question', 'questions')}</span> this
            week, {trendSentence(thisWeek, lastWeek)}.
          </p>
          <Sparkline
            className="mt-3"
            values={weeks.map((w) => w.wesQuestions)}
            label={`Questions to Wes each week: ${weeks.map((w) => w.wesQuestions).join(', ')}`}
          />
          {helpfulPct !== null && (
            <p className="mt-2 text-sm text-ink-muted">
              {helpfulPct}% of rated answers were helpful ({data.wesHelpful} of {feedbackTotal}).
            </p>
          )}
        </Card>

        <section aria-labelledby="children-title" className="space-y-3">
          <h2 id="children-title" className="px-1 text-lg font-black text-ink">
            Children and families
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Children" value={data.childrenActive} note="in your register" />
            <Stat
              label="Waiting"
              value={data.awaitingConsent}
              note={data.awaitingConsent === 1 ? 'needs parent consent' : 'need parent consent'}
            />
            <Stat label="New consents" value={data.consentsGranted} note="in this period" />
            <Stat label="Parents" value={data.parentsLinked} note="linked to the app" />
          </div>
        </section>

        <section aria-labelledby="att-title">
          <Card>
            <h2 id="att-title" className="font-black text-ink">
              Attendance
            </h2>
            {data.attendanceRate === null ? (
              <p className="mt-1 text-sm text-ink-muted">
                Take the register each day and your attendance trend will show here.
              </p>
            ) : (
              <>
                <p className="mt-1 text-ink">
                  On average <span className="font-black">{data.attendanceRate}%</span> of children
                  were present.
                </p>
                <Sparkline
                  className="mt-3"
                  values={weeks.map((w) => w.attendanceRate)}
                  label={`Weekly attendance: ${weeks
                    .map((w) => (w.attendanceRate === null ? 'no data' : `${w.attendanceRate}%`))
                    .join(', ')}`}
                />
              </>
            )}
          </Card>
        </section>

        <section aria-labelledby="team-title">
          <Card className="flex items-center justify-between gap-3">
            <div>
              <h2 id="team-title" className="font-black text-ink">
                Your team
              </h2>
              <p className="text-sm text-ink-muted">
                {plural(data.staff, 'staff member', 'staff members')}. Registration:{' '}
                {registrationLabel(data.registrationStatus)}.
              </p>
            </div>
            {canManagePeople &&
              renderLink({
                href: '/people',
                className: buttonClass({ variant: 'secondary' }),
                children: (
                  <>
                    <PeopleIcon size={20} />
                    People
                  </>
                ),
              })}
          </Card>
        </section>
      </main>
    </AppShell>
  );
}

// ---------- Platform admin console ----------

export interface AdminMetricsData {
  from: string;
  to: string;
  centres: {
    total: number;
    new: number;
    byProvince: { label: string | null; count: number }[];
    funnel: { label: string | null; count: number }[];
    childrenActive: number;
  };
  users: {
    total: number;
    new: number;
    dau: number;
    wau: number;
    mau: number;
    daily: { day: string; active: number }[];
    retention: { cohort: string; size: number; month1: number; month2: number }[];
  };
  wes: {
    questions: number;
    costUsd: number;
    tokens: number;
    avgLatencyMs: number | null;
    errors: number;
    escalations: number;
    topIntents: { label: string | null; count: number }[];
    feedback: { up: number; down: number; reasons: { label: string | null; count: number }[] };
  };
}

export interface AdminCentreRow {
  centreId: string;
  name: string;
  province: string;
  city: string;
  registrationStatus: string;
  children: number | null;
  staff: number;
  wesQuestions: number;
  costUsd: number;
  lastActive: string | null;
}

export interface AdminFilters {
  from?: string;
  to?: string;
  province?: string;
  city?: string;
  size?: string;
  status?: string;
  role?: string;
}

const PROVINCE_NAMES: Record<string, string> = {
  EC: 'Eastern Cape',
  FS: 'Free State',
  GP: 'Gauteng',
  KZN: 'KwaZulu-Natal',
  LP: 'Limpopo',
  MP: 'Mpumalanga',
  NC: 'Northern Cape',
  NW: 'North West',
  WC: 'Western Cape',
};

const REASON_LABEL: Record<string, string> = {
  wrong: 'Wrong',
  not_helpful: 'Not helpful',
  not_relevant_locally: 'Not right for us',
  too_long: 'Too long',
  unsafe: 'Unsafe',
  other: 'Other',
};

const pct = (part: number, whole: number) =>
  whole > 0 ? `${Math.round((part / whole) * 100)}%` : 'no data';
const usd = (n: number) => `$${n.toFixed(2)}`;
const named = (items: { label: string | null; count: number }[], map?: Record<string, string>) =>
  items.map((i) => ({ label: i.label ? (map?.[i.label] ?? i.label) : 'Unknown', count: i.count }));

function FilterSelect({
  name,
  label,
  value,
  options,
}: {
  name: string;
  label: string;
  value?: string;
  options: [string, string][];
}) {
  return (
    <label className="block min-w-0 text-sm font-extrabold text-ink">
      {label}
      <select
        name={name}
        defaultValue={value ?? ''}
        className="mt-1 block min-h-touch w-full rounded-md border-2 border-line bg-surface px-3 text-base text-ink"
      >
        <option value="">All</option>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}

export function AdminConsoleScreen({
  metrics,
  centres,
  filters,
  exportHref,
  renderLink = defaultRenderLink,
}: {
  metrics: AdminMetricsData;
  centres: AdminCentreRow[];
  filters: AdminFilters;
  exportHref: string;
  renderLink?: RenderLink;
}) {
  const { users, wes } = metrics;
  const active = Object.values(filters).filter(Boolean).length;
  const rated = wes.feedback.up + wes.feedback.down;
  return (
    <AppShell active="home" renderLink={renderLink}>
      <PageHeader
        title="Platform"
        subtitle={`${formatDay(metrics.from)} to ${formatDay(metrics.to)}. Totals only, never child records.`}
        action={renderLink({
          href: '/people',
          className: buttonClass({ variant: 'secondary' }),
          children: (
            <>
              <PeopleIcon size={20} />
              People
            </>
          ),
        })}
      />
      <main className="space-y-5 px-4 pb-6">
        {/* A plain GET form: filters live in the URL, so views can be shared and bookmarked. */}
        <details className="rounded-lg bg-surface p-4 shadow-card" open={active > 0}>
          <summary className="flex min-h-touch cursor-pointer items-center justify-between font-black text-ink">
            <span>Filters{active > 0 ? ` (${active} on)` : ''}</span>
            <ChartIcon size={20} />
          </summary>
          <form method="get" action="/admin" className="mt-3 grid grid-cols-2 gap-3">
            <label className="block text-sm font-extrabold text-ink">
              From
              <input
                type="date"
                name="from"
                defaultValue={filters.from ?? metrics.from}
                className="mt-1 block min-h-touch w-full rounded-md border-2 border-line bg-surface px-3 text-base text-ink"
              />
            </label>
            <label className="block text-sm font-extrabold text-ink">
              To
              <input
                type="date"
                name="to"
                defaultValue={filters.to ?? metrics.to}
                className="mt-1 block min-h-touch w-full rounded-md border-2 border-line bg-surface px-3 text-base text-ink"
              />
            </label>
            <FilterSelect
              name="province"
              label="Province"
              value={filters.province}
              options={Object.entries(PROVINCE_NAMES)}
            />
            <label className="block text-sm font-extrabold text-ink">
              City or town
              <input
                type="text"
                name="city"
                defaultValue={filters.city ?? ''}
                placeholder="Any"
                className="mt-1 block min-h-touch w-full rounded-md border-2 border-line bg-surface px-3 text-base text-ink"
              />
            </label>
            <FilterSelect
              name="size"
              label="Centre size"
              value={filters.size}
              options={[
                ['small', 'Under 20 children'],
                ['medium', '20 to 50'],
                ['large', 'Over 50'],
              ]}
            />
            <FilterSelect
              name="status"
              label="Registration"
              value={filters.status}
              options={Object.entries(STATUS_LABEL)}
            />
            <FilterSelect
              name="role"
              label="People"
              value={filters.role}
              options={[
                ['principal', 'Principals'],
                ['practitioner', 'Practitioners'],
                ['parent', 'Parents'],
                ['funder', 'Funders'],
              ]}
            />
            <div className="col-span-2 flex gap-3">
              <button type="submit" className={cx(buttonClass({ block: true }), 'flex-1')}>
                Apply filters
              </button>
              {renderLink({
                href: '/admin',
                className: buttonClass({ variant: 'secondary' }),
                children: 'Reset filters',
              })}
            </div>
          </form>
        </details>

        <section aria-labelledby="growth-title" className="space-y-3">
          <h2 id="growth-title" className="px-1 text-lg font-black text-ink">
            Growth
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <Stat
              tone="brand"
              label="Centres"
              value={metrics.centres.total}
              note={`${metrics.centres.new} new`}
            />
            <Stat label="People" value={users.total} note={`${users.new} new`} />
            <Stat label="Children" value={metrics.centres.childrenActive} note="with consent" />
            <Stat
              label="Active this month"
              value={users.mau}
              note={`${users.wau} this week, ${users.dau} today`}
            />
          </div>
          <Card>
            <h3 className="font-black text-ink">People active each day</h3>
            <Sparkline
              className="mt-3"
              values={users.daily.map((d) => d.active)}
              label={`Daily active people: ${users.daily.map((d) => d.active).join(', ') || 'no data'}`}
            />
            <p className="mt-2 text-sm text-ink-muted">
              Weekly active is {pct(users.wau, users.total)} of everyone.
            </p>
          </Card>
        </section>

        <section aria-labelledby="funnel-title">
          <Card>
            <h2 id="funnel-title" className="font-black text-ink">
              Registration journey
            </h2>
            <div className="mt-3">
              <BarList items={named(metrics.centres.funnel, STATUS_LABEL)} />
            </div>
          </Card>
        </section>

        <section aria-labelledby="prov-title">
          <Card>
            <h2 id="prov-title" className="font-black text-ink">
              Centres by province
            </h2>
            <div className="mt-3">
              <BarList items={named(metrics.centres.byProvince, PROVINCE_NAMES)} />
            </div>
          </Card>
        </section>

        <section aria-labelledby="wes-title" className="space-y-3">
          <h2 id="wes-title" className="px-1 text-lg font-black text-ink">
            Wes
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Questions" value={wes.questions} note={`${wes.errors} errors`} />
            <Stat
              label="Model cost"
              value={usd(wes.costUsd)}
              note={`${wes.tokens.toLocaleString('en-ZA')} tokens`}
            />
            <Stat label="Helpful" value={pct(wes.feedback.up, rated)} note={`${rated} rated`} />
            <Stat label="Escalations" value={wes.escalations} note="child protection flows" />
          </div>
          <Card>
            <h3 className="font-black text-ink">What people ask about</h3>
            <div className="mt-3">
              <BarList items={named(wes.topIntents)} />
            </div>
          </Card>
          <Card>
            <h3 className="font-black text-ink">Why answers missed</h3>
            <div className="mt-3">
              <BarList
                items={named(wes.feedback.reasons, REASON_LABEL)}
                empty="No thumbs down yet"
              />
            </div>
          </Card>
        </section>

        <section aria-labelledby="ret-title">
          <Card>
            <h2 id="ret-title" className="font-black text-ink">
              Coming back
            </h2>
            <p className="text-sm text-ink-muted">
              People who joined each month and returned later.
            </p>
            {users.retention.length === 0 ? (
              <p className="mt-2 text-sm text-ink-muted">No sign ups in the last six months.</p>
            ) : (
              <table className="mt-3 w-full text-left text-sm">
                <thead>
                  <tr className="text-ink-muted">
                    <th className="py-1 font-extrabold">Joined</th>
                    <th className="py-1 text-right font-extrabold">People</th>
                    <th className="py-1 text-right font-extrabold">Month 1</th>
                    <th className="py-1 text-right font-extrabold">Month 2</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {users.retention.map((r) => (
                    <tr key={r.cohort}>
                      <td className="py-2 font-bold text-ink">{r.cohort}</td>
                      <td className="py-2 text-right tabular-nums">{r.size}</td>
                      <td className="py-2 text-right tabular-nums">{pct(r.month1, r.size)}</td>
                      <td className="py-2 text-right tabular-nums">{pct(r.month2, r.size)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </section>

        <section aria-labelledby="centres-title" className="space-y-3">
          <div className="flex items-end justify-between gap-3 px-1">
            <h2 id="centres-title" className="text-lg font-black text-ink">
              Centres
            </h2>
            <a href={exportHref} className={buttonClass({ variant: 'ghost' })} download>
              <DownloadIcon size={20} />
              Download CSV
            </a>
          </div>
          {centres.length === 0 ? (
            <Card>
              <p className="text-ink-muted">No centres match these filters.</p>
            </Card>
          ) : (
            <ul className="space-y-3">
              {centres.map((c) => (
                <li key={c.centreId}>
                  <Card>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-black text-ink">{c.name}</p>
                        <p className="text-sm text-ink-muted">
                          {[c.city, PROVINCE_NAMES[c.province] ?? c.province]
                            .filter(Boolean)
                            .join(', ')}
                        </p>
                      </div>
                      <Chip tone={c.registrationStatus === 'registered' ? 'success' : 'brand'}>
                        {registrationLabel(c.registrationStatus)}
                      </Chip>
                    </div>
                    <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
                      <div>
                        <dt className="text-ink-muted">Children</dt>
                        <dd className="font-extrabold text-ink">{c.children ?? 'Fewer than 5'}</dd>
                      </div>
                      <div>
                        <dt className="text-ink-muted">Questions</dt>
                        <dd className="font-extrabold text-ink">{c.wesQuestions}</dd>
                      </div>
                      <div>
                        <dt className="text-ink-muted">Last active</dt>
                        <dd className="font-extrabold text-ink">
                          {c.lastActive ? formatDay(c.lastActive) : 'Not yet'}
                        </dd>
                      </div>
                    </dl>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </AppShell>
  );
}
