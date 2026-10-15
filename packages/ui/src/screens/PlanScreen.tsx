'use client';

import { useState } from 'react';
import { BookIcon, LeafIcon, PrinterIcon, SparkleIcon } from '../icons';
import { SproutBook } from '../illustrations';
import { defaultRenderLink, type RenderLink } from '../nav';
import { Button, Card, Chip, buttonClass, cx } from '../primitives';
import { AppShell, PageHeader } from '../shell';

export interface PlanActivity {
  id: string;
  time: string;
  title: string;
  eldas: string[];
  materials: string[];
  printable?: string;
}

export interface WeekPlan {
  theme: string;
  weekLabel: string;
  days: { key: string; short: string; activities: PlanActivity[] }[];
  citation: string;
}

export function PlanScreen({
  plan,
  todayKey,
  renderLink = defaultRenderLink,
  demo,
}: {
  plan: WeekPlan | null;
  todayKey?: string;
  renderLink?: RenderLink;
  demo?: boolean;
}) {
  const [day, setDay] = useState(todayKey ?? plan?.days[0]?.key ?? '');
  const current = plan?.days.find((d) => d.key === day);

  return (
    <AppShell active="plan" renderLink={renderLink}>
      <PageHeader
        title="Weekly plan"
        subtitle={plan ? plan.weekLabel : 'Plan learning for the week ahead.'}
      />
      <main className="space-y-4 px-4">
        {!plan ? (
          <Card className="py-8 text-center">
            <SproutBook className="mx-auto w-40" />
            <h2 className="mt-3 text-xl font-black text-ink">No plan for this week yet</h2>
            <p className="mx-auto mt-1 max-w-72 text-ink-muted">
              Wes can draft a theme plan for your age groups, linked to the NCF. You can change
              anything.
            </p>
            {renderLink({
              href: '/wes?q=Plan%20next%20week',
              className: `${buttonClass()} mt-5`,
              children: (
                <>
                  <SparkleIcon size={18} />
                  Make a plan with Wes
                </>
              ),
            })}
          </Card>
        ) : (
          <>
            <Card tone="brand" className="relative overflow-hidden">
              <p className="text-xs font-extrabold tracking-wide text-brand-strong uppercase">
                Theme
              </p>
              <h2 className="text-2xl font-black text-ink">{plan.theme}</h2>
              <p className="mt-2 flex items-center gap-1.5 text-sm text-ink-muted">
                <BookIcon size={16} className="shrink-0" />
                <span>{plan.citation}</span>
              </p>
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
                <li key={a.id}>
                  <Card>
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 rounded-md bg-sunk px-2 py-1 text-xs font-extrabold text-ink-muted tabular-nums">
                        {a.time}
                      </span>
                      <div className="min-w-0 flex-1">
                        <h3 className="font-black text-ink">{a.title}</h3>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {a.eldas.map((e) => (
                            <Chip key={e} tone="accent">
                              {e}
                            </Chip>
                          ))}
                        </div>
                        {a.materials.length > 0 && (
                          <p className="mt-2 flex items-start gap-1.5 text-sm text-ink-muted">
                            <LeafIcon size={16} className="mt-0.5 shrink-0 text-success" />
                            <span>
                              <span className="font-extrabold text-success">Free materials:</span>{' '}
                              {a.materials.join(', ')}
                            </span>
                          </p>
                        )}
                        {a.printable && (
                          <Button
                            variant="secondary"
                            className="mt-3"
                            icon={<PrinterIcon size={18} />}
                          >
                            Print {a.printable}
                          </Button>
                        )}
                      </div>
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
            {demo && (
              <p className="pb-4 text-center">
                <Chip>Demo data</Chip>
              </p>
            )}
          </>
        )}
      </main>
    </AppShell>
  );
}
