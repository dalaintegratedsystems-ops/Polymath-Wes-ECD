import { ArrowRightIcon, DocumentIcon, SendIcon } from '../icons';
import { Celebration } from '../illustrations';
import { defaultRenderLink, type RenderLink } from '../nav';
import { Button, Card, Chip, buttonClass } from '../primitives';
import { JourneySteps, ProgressRing, type JourneyStep } from '../progress';
import { AppShell, PageHeader } from '../shell';

export function registrationPercent(steps: JourneyStep[]): number {
  if (steps.length === 0) return 0;
  const score = steps.reduce((a, s) => a + (s.status === 'done' ? 1 : s.status === 'current' ? 0.5 : 0), 0);
  return Math.round((score / steps.length) * 100);
}

export function RegistrationScreen({
  steps,
  renderLink = defaultRenderLink,
  demo,
}: {
  steps: JourneyStep[];
  renderLink?: RenderLink;
  demo?: boolean;
}) {
  const percent = registrationPercent(steps);
  const complete = steps.length > 0 && steps.every((s) => s.status === 'done');
  const done = steps.filter((s) => s.status === 'done').length;

  return (
    <AppShell active="registration" renderLink={renderLink}>
      <PageHeader title="Registration" subtitle="Your path to DBE registration and the ECD subsidy." />
      <main className="space-y-5 px-4">
        {complete ? (
          <Card className="text-center">
            <Celebration className="mx-auto w-48" />
            <h2 className="mt-2 text-2xl font-black text-ink">Your application pack is ready!</h2>
            <p className="mt-1 text-ink-muted">Well done. Check it once more, then submit it to your district office.</p>
            <div className="mt-5 grid gap-3">
              <Button size="lg" block icon={<DocumentIcon size={20} />}>
                Download pack (PDF)
              </Button>
              <Button variant="secondary" block icon={<SendIcon size={20} />}>
                Share on WhatsApp
              </Button>
            </div>
          </Card>
        ) : (
          <Card className="flex items-center gap-4">
            <ProgressRing percent={percent} size={84} stroke={9} label="Registration progress" />
            <div>
              <p className="text-xl leading-snug font-black text-ink">
                {done} of {steps.length} steps done
              </p>
              <p className="mt-1 text-sm text-ink-muted">Keep going — every step brings funding closer.</p>
            </div>
          </Card>
        )}

        <Card>
          <JourneySteps
            steps={steps}
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
          Wes checks your answers against the official registration guidance and shows its sources. You stay in
          charge: nothing is submitted without you.
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
