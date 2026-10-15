'use client';

import { useState } from 'react';
import { CheckIcon, ShieldIcon } from '../icons';
import { SproutBook } from '../illustrations';
import { defaultRenderLink, type RenderLink } from '../nav';
import { Avatar, Button, Card, Chip, cx } from '../primitives';
import { ProgressBar } from '../progress';
import { AppShell, PageHeader } from '../shell';
import { ageLabel } from '../format';

export interface ChildRow {
  id: string;
  firstName: string;
  birthMonth: string;
  group: string;
  present: boolean | null;
}

/**
 * Child register with one-tap attendance. Rows are 64px tall: big, forgiving targets
 * for a practitioner holding a phone in one hand and a toddler in the other.
 */
export function ChildrenScreen({
  childrenList,
  groups,
  today = new Date(),
  renderLink = defaultRenderLink,
  demo,
}: {
  childrenList: ChildRow[];
  groups: string[];
  today?: Date;
  renderLink?: RenderLink;
  demo?: boolean;
}) {
  const [group, setGroup] = useState<string>('All');
  const [present, setPresent] = useState<Record<string, boolean | null>>(
    Object.fromEntries(childrenList.map((c) => [c.id, c.present])),
  );
  const shown = childrenList.filter((c) => group === 'All' || c.group === group);
  const hereCount = Object.values(present).filter(Boolean).length;

  return (
    <AppShell active="children" renderLink={renderLink}>
      <PageHeader title="Children" subtitle={`${childrenList.length} children in your centre`} />
      <main className="space-y-4 px-4">
        {childrenList.length === 0 ? (
          <Card className="py-8 text-center">
            <SproutBook className="mx-auto w-40" />
            <h2 className="mt-3 text-xl font-black text-ink">No children yet</h2>
            <p className="mx-auto mt-1 max-w-72 text-ink-muted">
              Add a child after their parent or caregiver gives consent.
            </p>
            <Button className="mt-5">Add a child</Button>
          </Card>
        ) : (
          <>
            <Card>
              <div className="flex items-baseline justify-between">
                <h2 className="font-black text-ink">Today’s register</h2>
                <p className="text-sm font-extrabold text-ink-muted tabular-nums">
                  {hereCount} of {childrenList.length} here
                </p>
              </div>
              <div className="mt-3">
                <ProgressBar
                  value={hereCount}
                  max={childrenList.length}
                  label="Children marked present"
                />
              </div>
            </Card>

            <div
              role="radiogroup"
              aria-label="Filter by group"
              className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]"
            >
              {['All', ...groups].map((g) => (
                <button
                  key={g}
                  type="button"
                  role="radio"
                  aria-checked={group === g}
                  onClick={() => setGroup(g)}
                  className={cx(
                    'min-h-10 shrink-0 rounded-full px-4 text-sm font-extrabold transition-colors',
                    group === g ? 'bg-ink text-canvas' : 'bg-surface text-ink-muted shadow-card',
                  )}
                >
                  {g}
                </button>
              ))}
            </div>

            <ul className="overflow-hidden rounded-lg bg-surface shadow-card">
              {shown.map((c) => {
                const isHere = present[c.id] === true;
                return (
                  <li
                    key={c.id}
                    className="flex min-h-16 items-center gap-3 border-b border-line px-3 py-2 last:border-b-0"
                  >
                    <Avatar name={c.firstName} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-extrabold text-ink">{c.firstName}</p>
                      <p className="text-sm leading-snug text-ink-muted">
                        {c.group} · {ageLabel(c.birthMonth, today)}
                      </p>
                    </div>
                    <button
                      type="button"
                      aria-pressed={isHere}
                      aria-label={`${c.firstName}: ${isHere ? 'here' : 'not marked'}`}
                      onClick={() => setPresent((p) => ({ ...p, [c.id]: !isHere }))}
                      className={cx(
                        'inline-flex min-h-touch min-w-24 items-center justify-center gap-1.5 rounded-full px-3 text-sm font-extrabold transition-colors',
                        isHere
                          ? 'bg-success text-on-success'
                          : 'border-2 border-line text-ink-muted',
                      )}
                    >
                      {isHere && <CheckIcon size={18} />}
                      {isHere ? 'Here' : 'Mark here'}
                    </button>
                  </li>
                );
              })}
            </ul>

            <Card tone="sunk" className="flex items-start gap-3">
              <ShieldIcon size={22} className="mt-0.5 shrink-0 text-success" />
              <div>
                <p className="font-extrabold text-ink">Adding a child?</p>
                <p className="text-sm text-ink-muted">
                  We ask a parent or caregiver for consent first. We only keep a first name, birth
                  month and group.
                </p>
              </div>
            </Card>
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
