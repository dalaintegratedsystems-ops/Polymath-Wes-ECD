import { ArrowRightIcon, DocumentIcon } from '../icons';
import { Celebration } from '../illustrations';
import { defaultRenderLink, type RenderLink } from '../nav';
import { Card, Chip, buttonClass, cx } from '../primitives';
import { JourneySteps, ProgressRing, type JourneyStep } from '../progress';
import { AppShell, PageHeader } from '../shell';

export function registrationPercent(steps: JourneyStep[]): number {
  if (steps.length === 0) return 0;
  const score = steps.reduce(
    (a, s) => a + (s.status === 'done' ? 1 : s.status === 'current' ? 0.5 : 0),
    0,
  );
  return Math.round((score / steps.length) * 100);
}

export function RegistrationScreen({
  steps,
  percent: givenPercent,
  expiringDocuments = 0,
  renderLink = defaultRenderLink,
  demo,
}: {
  steps: JourneyStep[];
  /** Progress from the API; computed from the steps when not given (stories, demo). */
  percent?: number;
  expiringDocuments?: number;
  renderLink?: RenderLink;
  demo?: boolean;
}) {
  const percent = givenPercent ?? registrationPercent(steps);
  const complete = steps.length > 0 && steps.every((s) => s.status === 'done');
  const done = steps.filter((s) => s.status === 'done').length;

  return (
    <AppShell active="registration" renderLink={renderLink}>
      <PageHeader
        title="Registration"
        subtitle="Your path to DBE registration and the ECD subsidy."
      />
      <main className="space-y-5 px-4">
        {complete ? (
          <Card className="text-center">
            <Celebration className="mx-auto w-48" />
            <h2 className="mt-2 text-2xl font-black text-ink">Your application is submitted!</h2>
            <p className="mt-1 text-ink-muted">
              Well done. Keep your documents up to date: Wes reminds you before they expire.
            </p>
            {renderLink({
              href: '/registration/pack',
              className: cx(buttonClass({ size: 'lg', block: true }), 'mt-5'),
              children: (
                <>
                  <DocumentIcon size={20} />
                  Your application pack
                </>
              ),
            })}
          </Card>
        ) : (
          <Card className="flex items-center gap-4">
            <ProgressRing percent={percent} size={84} stroke={9} label="Registration progress" />
            <div>
              <p className="text-xl leading-snug font-black text-ink">
                {done} of {steps.length} steps done
              </p>
              <p className="mt-1 text-sm text-ink-muted">
                Keep going. Every step brings funding closer.
              </p>
            </div>
          </Card>
        )}

        {expiringDocuments > 0 &&
          renderLink({
            href: '/registration/documents',
            className:
              'block rounded-lg border-2 border-accent bg-accent-soft p-4 font-extrabold text-ink',
            children: (
              <>
                {expiringDocuments === 1
                  ? '1 document has expired or needs renewing soon.'
                  : `${expiringDocuments} documents have expired or need renewing soon.`}{' '}
                <span className="text-primary">See documents</span>
              </>
            ),
          })}

        <Card>
          <JourneySteps
            steps={steps}
            renderSecondary={(s) =>
              renderLink({
                href: `/registration/${s.id}`,
                className:
                  'inline-flex min-h-touch items-center text-sm font-extrabold text-primary',
                children: s.status === 'done' ? 'View or change' : 'Start this step',
              })
            }
            renderAction={(s) =>
              renderLink({
                href: `/registration/${s.id}`,
                className: buttonClass({ size: 'md' }),
                children: (
                  <>
                    Continue
                    <ArrowRightIcon size={18} />
                  </>
                ),
              })
            }
          />
        </Card>

        <p className="px-1 pb-4 text-sm text-ink-muted">
          You can do the steps in any order. You stay in charge: nothing is submitted without you.
        </p>
        {demo && (
          <p className="pb-4 text-center">
            <Chip>Demo data</Chip>
          </p>
        )}
      </main>
    </AppShell>
  );
}
