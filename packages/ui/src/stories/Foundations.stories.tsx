import type { Meta, StoryObj } from '@storybook/react-vite';
import { contrastRatio } from '../contrast';
import * as Icons from '../icons';
import { Celebration, RestingPhone, SproutBook, SunriseScene } from '../illustrations';
import { Avatar, Button, Card, Chip } from '../primitives';
import { JourneySteps, ProgressBar, ProgressRing } from '../progress';
import { demoSteps } from '../demo';
import { palette, themes } from '../tokens';

const meta: Meta = { title: 'Foundations', parameters: { layout: 'padded' } };
export default meta;
type Story = StoryObj;

export const Colours: Story = {
  render: () => (
    <div className="space-y-6 bg-canvas p-2 text-ink">
      <section>
        <h2 className="mb-2 text-lg font-black">Semantic tokens (light / dark)</h2>
        <div className="grid grid-cols-1 gap-2">
          {(Object.keys(themes.light) as (keyof typeof themes.light)[]).map((k) => (
            <div key={k} className="flex items-center gap-3 text-sm">
              <span
                className="size-9 rounded-md border border-line"
                style={{ background: themes.light[k] }}
              />
              <span
                className="size-9 rounded-md border border-line"
                style={{ background: themes.dark[k] }}
              />
              <code className="font-bold">{k}</code>
            </div>
          ))}
        </div>
      </section>
      <section>
        <h2 className="mb-2 text-lg font-black">Palette</h2>
        <div className="flex flex-wrap gap-2">
          {Object.entries(palette).map(([k, hex]) => (
            <div key={k} className="w-20 text-xs">
              <div className="h-12 rounded-md border border-line" style={{ background: hex }} />
              <p className="mt-1 font-bold">{k}</p>
              <p className="text-ink-muted">{hex}</p>
            </div>
          ))}
        </div>
      </section>
      <p className="text-sm text-ink-muted">
        Body ink on canvas: {contrastRatio(themes.light.ink, themes.light.canvas).toFixed(1)}:1
        (light), {contrastRatio(themes.dark.ink, themes.dark.canvas).toFixed(1)}:1 (dark).
      </p>
    </div>
  ),
};

export const Typography: Story = {
  render: () => (
    <div className="space-y-3 text-ink">
      <p className="text-[2rem] leading-tight font-black tracking-tight">Good morning, Nomsa</p>
      <p className="text-2xl font-black">3 steps left to submit your registration</p>
      <p className="text-xl font-black">Today’s register</p>
      <p className="text-base">Body text is 16px minimum, plain language, short sentences.</p>
      <p className="text-sm text-ink-muted">Helper text, 15px, for supporting details only.</p>
    </div>
  ),
};

export const Buttons: Story = {
  render: () => (
    <div className="flex max-w-sm flex-col gap-3">
      <Button size="lg" block icon={<Icons.ArrowRightIcon size={20} />}>
        Continue registration
      </Button>
      <Button variant="secondary" icon={<Icons.PrinterIcon size={18} />}>
        Print worksheet
      </Button>
      <Button variant="success" icon={<Icons.CheckIcon size={18} />}>
        Approve draft
      </Button>
      <Button variant="ghost">Not now</Button>
      <Button disabled>Disabled</Button>
    </div>
  ),
};

export const Progress: Story = {
  render: () => (
    <div className="max-w-sm space-y-6">
      <div className="flex gap-4">
        <ProgressRing percent={58} label="Registration" />
        <ProgressRing percent={100} label="Done" tone="success" />
      </div>
      <ProgressBar value={9} max={11} label="Present" />
      <Card>
        <JourneySteps steps={demoSteps} />
      </Card>
    </div>
  ),
};

export const ChipsAndAvatars: Story = {
  render: () => (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Chip>Neutral</Chip>
        <Chip tone="success">Here</Chip>
        <Chip tone="accent">Creativity</Chip>
        <Chip tone="brand">Registration</Chip>
      </div>
      <div className="flex gap-2">
        {['Amahle', 'Sipho', 'Mieke', 'Zian'].map((n) => (
          <Avatar key={n} name={n} />
        ))}
      </div>
    </div>
  ),
};

export const IconSet: Story = {
  render: () => (
    <div className="grid grid-cols-4 gap-4 text-ink">
      {Object.entries(Icons).map(([name, Icon]) => (
        <div key={name} className="flex flex-col items-center gap-1 text-xs">
          <Icon size={28} />
          <span className="text-ink-muted">{name.replace('Icon', '')}</span>
        </div>
      ))}
    </div>
  ),
};

export const Illustrations: Story = {
  render: () => (
    <div className="grid max-w-md grid-cols-2 gap-4">
      <Card className="col-span-2">
        <SunriseScene />
      </Card>
      <Card>
        <Celebration />
      </Card>
      <Card>
        <SproutBook />
      </Card>
      <Card>
        <RestingPhone />
      </Card>
    </div>
  ),
};
