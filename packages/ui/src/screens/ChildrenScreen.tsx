'use client';

import { useState } from 'react';
import { CheckIcon, ChildrenIcon, ShieldIcon } from '../icons';
import { SproutBook } from '../illustrations';
import { defaultRenderLink, type RenderLink } from '../nav';
import { Avatar, Card, Chip, buttonClass, cx } from '../primitives';
import { ProgressBar } from '../progress';
import { AppShell, PageHeader } from '../shell';
import { ageLabel } from '../format';

export interface ChildRow {
  id: string;
  firstName: string;
  birthMonth: string;
  group: string | null;
  present: boolean | null;
  /** Intakes waiting for a guardian's consent are listed but can't be marked present. */
  status?: 'active' | 'awaiting_consent';
}

/**
 * Child register. Rows are 64px tall: big, forgiving targets for a practitioner holding a
 * phone in one hand and a toddler in the other. Attendance taps arrive with Milestone 5;
 * until then `attendance={false}` shows the register without them.
 */
export function ChildrenScreen({
  childrenList,
  groups,
  today = new Date(),
  attendance = true,
  canAdd = true,
  renderLink = defaultRenderLink,
  demo,
}: {
  childrenList: ChildRow[];
  groups: string[];
  today?: Date;
  attendance?: boolean;
  canAdd?: boolean;
  renderLink?: RenderLink;
  demo?: boolean;
}) {
  const [group, setGroup] = useState<string>('All');
  const [present, setPresent] = useState<Record<string, boolean | null>>(
    Object.fromEntries(childrenList.map((c) => [c.id, c.present])),
  );
  const active = childrenList.filter((c) => c.status !== 'awaiting_consent');
  const waiting = childrenList.filter((c) => c.status === 'awaiting_consent');
  const shown = active.filter((c) => group === 'All' || c.group === group);
  const hereCount = active.filter((c) => present[c.id]).length;

  const addLink = canAdd
    ? renderLink({
        href: '/children/add',
        className: buttonClass({ variant: 'secondary' }),
        children: '+ Add',
      })
    : null;

  return (
    <AppShell active="children" renderLink={renderLink}>
      <PageHeader
        title="Children"
        subtitle={`${active.length} ${active.length === 1 ? 'child' : 'children'} in your register`}
        action={childrenList.length > 0 ? addLink : null}
      />
      <main className="space-y-4 px-4 pb-4">
        {childrenList.length === 0 ? (
          <Card className="py-8 text-center">
            <SproutBook className="mx-auto w-40" />
            <h2 className="mt-3 text-xl font-black text-ink">No children yet</h2>
            <p className="mx-auto mt-1 max-w-72 text-ink-muted">
              Add a child, then their parent or caregiver agrees with a PIN on their phone.
            </p>
            {canAdd &&
              renderLink({
                href: '/children/add',
                className: `${buttonClass({ size: 'lg' })} mt-5`,
                children: 'Add your first child',
              })}
          </Card>
        ) : (
          <>
            {waiting.length > 0 && (
              <section aria-labelledby="waiting-title" className="space-y-2">
                <h2 id="waiting-title" className="px-1 font-black text-ink">
                  Waiting for consent
                </h2>
                <ul className="overflow-hidden rounded-lg border-2 border-dashed border-line bg-surface">
                  {waiting.map((c) => (
                    <li
                      key={c.id}
                      className="flex min-h-16 items-center gap-3 border-b border-line px-3 py-2 last:border-b-0"
                    >
                      <Avatar name={c.firstName} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-extrabold text-ink">{c.firstName}</p>
                        <p className="text-sm text-ink-muted">Not in the register yet</p>
                      </div>
                      {renderLink({
                        href: `/children/${c.id}/consent?name=${encodeURIComponent(c.firstName)}`,
                        className: buttonClass({ variant: 'primary' }),
                        children: 'Get consent',
                      })}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {attendance && active.length > 0 && (
              <Card>
                <div className="flex items-baseline justify-between">
                  <h2 className="font-black text-ink">Today’s register</h2>
                  <p className="text-sm font-extrabold text-ink-muted tabular-nums">
                    {hereCount} of {active.length} here
                  </p>
                </div>
                <div className="mt-3">
                  <ProgressBar
                    value={hereCount}
                    max={active.length}
                    label="Children marked present"
                  />
                </div>
              </Card>
            )}

            {groups.length > 0 && (
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
            )}

            {shown.length > 0 && (
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
                          {c.group ? `${c.group} · ` : ''}
                          {ageLabel(c.birthMonth, today)}
                        </p>
                      </div>
                      {attendance ? (
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
                      ) : (
                        <Chip tone="success" icon={<CheckIcon size={14} />}>
                          Consent
                        </Chip>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}

            {!attendance && active.length > 0 && (
              <p className="flex items-start gap-2 px-1 text-sm text-ink-muted">
                <ChildrenIcon size={18} className="mt-0.5 shrink-0" />
                <span>Taking the daily register with one tap is coming in the next update.</span>
              </p>
            )}

            <Card tone="sunk" className="flex items-start gap-3">
              <ShieldIcon size={22} className="mt-0.5 shrink-0 text-success" />
              <div>
                <p className="font-extrabold text-ink">Consent first, always</p>
                <p className="text-sm text-ink-muted">
                  A parent or caregiver agrees before a child is added. We only keep a first name,
                  birth month and group.
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
