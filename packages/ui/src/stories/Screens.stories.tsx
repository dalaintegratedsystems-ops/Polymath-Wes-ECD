import type { Meta, StoryObj } from '@storybook/react-vite';
import { demoChat, demoChildren, demoGroups, demoHome, demoPlan, demoSteps, demoSuggestions } from '../demo';
import { ChildrenScreen } from '../screens/ChildrenScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { OfflineScreen } from '../screens/OfflineScreen';
import { PlanScreen } from '../screens/PlanScreen';
import { RegistrationScreen } from '../screens/RegistrationScreen';
import { WesScreen } from '../screens/WesScreen';

const meta: Meta = { title: 'Screens', parameters: { layout: 'fullscreen' } };
export default meta;

type Story = StoryObj;
const today = new Date('2026-10-15T09:00:00');

export const Home: Story = { render: () => <HomeScreen data={demoHome} /> };
export const HomeOffline: Story = { name: 'Home — offline', render: () => <HomeScreen data={demoHome} offline /> };
export const HomeAfternoonNearlyDone: Story = {
  name: 'Home — one step left',
  render: () => (
    <HomeScreen
      data={{
        ...demoHome,
        hour: 15,
        registration: { percent: 92, stepsLeft: 1, nextStep: 'Submit your pack to the district office.' },
        attendance: { present: 11, total: 11 },
      }}
    />
  ),
};

export const RegistrationJourney: Story = {
  name: 'Registration journey',
  render: () => <RegistrationScreen steps={demoSteps} demo />,
};
export const RegistrationComplete: Story = {
  name: 'Registration — pack complete',
  render: () => <RegistrationScreen steps={demoSteps.map((s) => ({ ...s, status: 'done' as const }))} />,
};

export const ChildRegister: Story = {
  name: 'Child register + attendance',
  render: () => <ChildrenScreen childrenList={demoChildren} groups={demoGroups} today={today} demo />,
};
export const ChildRegisterEmpty: Story = {
  name: 'Child register — empty',
  render: () => <ChildrenScreen childrenList={[]} groups={[]} today={today} />,
};

export const WeeklyPlan: Story = {
  name: 'Weekly plan',
  render: () => <PlanScreen plan={demoPlan} todayKey="thu" demo />,
};
export const WeeklyPlanEmpty: Story = { name: 'Weekly plan — empty', render: () => <PlanScreen plan={null} /> };

export const AskWes: Story = {
  name: 'Ask Wes chat',
  render: () => <WesScreen messages={demoChat} suggestions={demoSuggestions} />,
};
export const AskWesFirstRun: Story = {
  name: 'Ask Wes — first run',
  render: () => <WesScreen messages={[]} suggestions={demoSuggestions} />,
};

export const Offline: Story = { render: () => <OfflineScreen /> };
