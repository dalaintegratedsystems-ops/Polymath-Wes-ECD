import { ArrowRightIcon, ChildrenIcon, PlanIcon, ShieldIcon, SparkleIcon } from '../icons';
import { SunriseScene } from '../illustrations';
import { defaultRenderLink, type RenderLink } from '../nav';
import { Avatar, Card, Chip, buttonClass, cx } from '../primitives';
import { ProgressBar, ProgressRing } from '../progress';
import { AppShell } from '../shell';
import { greetingFor, stepsLeftLabel } from '../format';

export interface HomeData {
  userName: string;
  centreName: string;
  dateLabel: string;
  hour: number;
  registration: { percent: number; stepsLeft: number; nextStep: string };
  /** Today's attendance once the register is taken (Milestone 5). */
  attendance?: { present: number; total: number };
  /** Children in the register; shown when there is no attendance yet. */
  childrenCount?: number;
  /** This week's plan, once one exists (Milestone 4). */
  plan?: { theme: string; today: string; eldas: string[] };
  suggestions: string[];
  demo?: boolean;
}

const GREETING = { morning: 'Good morning', afternoon: 'Good afternoon', evening: 'Good evening' };

export function HomeScreen({
  data,
  offline = false,
  renderLink = defaultRenderLink,
}: {
  data: HomeData;
  offline?: boolean;
  renderLink?: RenderLink;
}) {
  const { registration: reg, attendance: att, plan } = data;
  const allHere = att ? att.present === att.total : false;
  const count = data.childrenCount ?? 0;

  return (
    <AppShell active="home" offline={offline} renderLink={renderLink}>
      {/* Warm header: greeting, centre and a Cape sunrise */}
      <header className="relative overflow-hidden rounded-b-xl bg-brand-soft px-4 pt-[calc(env(safe-area-inset-top)+1.25rem)]">
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-2 rounded-full bg-surface/70 py-1 pr-3 pl-1 text-sm font-extrabold text-brand-strong">
            <span className="grid size-7 place-items-center rounded-full bg-primary text-on-primary">
              <SparkleIcon size={16} />
            </span>
            Wes
          </span>
          <Avatar name={data.userName} size={40} />
        </div>
        <h1 className="mt-5 text-[2rem] leading-[1.1] font-black tracking-tight text-ink">
          {GREETING[greetingFor(data.hour)]},
          <br />
          {data.userName}
        </h1>
        <p className="mt-2 text-ink-muted">
          <span className="font-extrabold text-ink">{data.centreName}</span> · {data.dateLabel}
        </p>
        <SunriseScene className="pointer-events-none -mr-4 ml-auto block w-[88%] max-w-96" />
      </header>

      <main className="relative -mt-10 space-y-5 px-4">
        {/* The one primary action: keep registration moving */}
        <section aria-labelledby="reg-title" className="rounded-xl bg-surface p-5 shadow-raised">
          <div className="flex items-center gap-4">
            <ProgressRing percent={reg.percent} label="Registration progress" />
            <div className="min-w-0">
              <Chip tone="brand">Registration</Chip>
              <h2 id="reg-title" className="mt-2 text-xl leading-snug font-black text-ink">
                {stepsLeftLabel(reg.stepsLeft)}
              </h2>
            </div>
          </div>
          <p className="mt-4 rounded-md bg-sunk px-3 py-2.5 text-sm text-ink-muted">
            <span className="font-extrabold text-ink">Next:</span> {reg.nextStep}
          </p>
          {renderLink({
            href: '/registration',
            className: cx(buttonClass({ size: 'lg', block: true }), 'mt-4'),
            children: (
              <>
                Continue registration
                <ArrowRightIcon size={20} />
              </>
            ),
          })}
        </section>

        {/* Today at a glance */}
        <section aria-labelledby="today-title">
          <h2 id="today-title" className="px-1 text-lg font-black text-ink">
            Today
          </h2>
          <div className="mt-3 grid grid-cols-2 gap-3">
            {renderLink({
              href: '/children',
              className:
                'block rounded-lg bg-surface p-4 shadow-card active:scale-[0.99] transition-transform',
              children: (
                <>
                  <span className="grid size-10 place-items-center rounded-full bg-success-soft text-success">
                    <ChildrenIcon size={22} />
                  </span>
                  {att ? (
                    <>
                      <p className="mt-3 text-[1.75rem] leading-none font-black tabular-nums text-ink">
                        {att.present}
                        <span className="text-base font-extrabold text-ink-muted">
                          /{att.total}
                        </span>
                      </p>
                      <p className="mt-1 text-sm font-bold text-ink-muted">
                        {allHere ? 'Everyone is here' : 'children here'}
                      </p>
                      <div className="mt-3">
                        <ProgressBar
                          value={att.present}
                          max={att.total}
                          label="Children present today"
                        />
                      </div>
                      <p className="mt-3 text-sm font-extrabold text-primary">Take register</p>
                    </>
                  ) : (
                    <>
                      <p className="mt-3 text-[1.75rem] leading-none font-black tabular-nums text-ink">
                        {count}
                      </p>
                      <p className="mt-1 text-sm font-bold text-ink-muted">
                        {count === 1 ? 'child in your register' : 'children in your register'}
                      </p>
                      <p className="mt-3 text-sm font-extrabold text-primary">
                        {count === 0 ? 'Add a child' : 'See children'}
                      </p>
                    </>
                  )}
                </>
              ),
            })}
            {renderLink({
              href: '/plan',
              className:
                'block rounded-lg bg-surface p-4 shadow-card active:scale-[0.99] transition-transform',
              children: (
                <>
                  <span className="grid size-10 place-items-center rounded-full bg-accent-soft text-accent">
                    <PlanIcon size={22} />
                  </span>
                  <p className="mt-3 text-xs font-extrabold tracking-wide text-ink-muted uppercase">
                    This week
                  </p>
                  <p className="text-lg leading-tight font-black text-ink">
                    {plan ? plan.theme : 'No plan yet'}
                  </p>
                  <p className="mt-1 text-sm text-ink-muted">
                    {plan ? plan.today : 'Wes can draft one for you'}
                  </p>
                  <p className="mt-3 text-sm font-extrabold text-primary">
                    {plan ? 'Open plan' : 'Make a plan'}
                  </p>
                </>
              ),
            })}
          </div>
        </section>

        {/* Ask Wes */}
        <section aria-labelledby="wes-title">
          <Card className="relative overflow-hidden">
            <div className="flex items-center gap-2">
              <span className="grid size-9 place-items-center rounded-full bg-primary text-on-primary">
                <SparkleIcon size={18} />
              </span>
              <h2 id="wes-title" className="text-lg font-black text-ink">
                Ask Wes
              </h2>
            </div>
            {renderLink({
              href: '/wes',
              className:
                'mt-3 flex min-h-touch items-center justify-between rounded-full border-2 border-line bg-canvas px-4 text-ink-muted',
              children: (
                <>
                  <span>Ask anything about your centre…</span>
                  <ArrowRightIcon size={20} />
                </>
              ),
            })}
            <ul className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
              {data.suggestions.map((s) => (
                <li key={s} className="shrink-0">
                  {renderLink({
                    href: `/wes?q=${encodeURIComponent(s)}`,
                    className:
                      'inline-flex min-h-10 items-center rounded-full bg-brand-soft px-3.5 text-sm font-extrabold text-brand-strong',
                    children: s,
                  })}
                </li>
              ))}
            </ul>
          </Card>
        </section>

        <p className="flex items-start gap-2 px-1 pb-2 text-sm text-ink-muted">
          <ShieldIcon size={18} className="mt-0.5 shrink-0 text-success" />
          <span>Children’s details stay private to your centre. Wes never diagnoses children.</span>
        </p>
        {data.demo && (
          <p className="pb-4 text-center">
            <Chip>Demo data</Chip>
          </p>
        )}
      </main>
    </AppShell>
  );
}
