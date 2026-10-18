import type { Meta, StoryObj } from '@storybook/react-vite';
import { demoChildren, demoGroups } from '../demo';
import { ChildrenScreen } from '../screens/ChildrenScreen';
import { WelcomeScreen, VerifyScreen } from '../screens/onboarding/AuthScreens';
import { AddChildScreen, ConsentScreen } from '../screens/onboarding/ChildConsentScreens';
import { SetupScreen } from '../screens/onboarding/SetupScreen';

const meta: Meta = { title: 'Onboarding', parameters: { layout: 'fullscreen' } };
export default meta;
type Story = StoryObj;

const wait = (ms = 600) => new Promise((r) => setTimeout(r, ms));
const ok = async () => {
  await wait();
  return null;
};

export const Welcome: Story = {
  render: () => <WelcomeScreen onSubmit={ok} />,
};

export const WelcomeWithError: Story = {
  name: 'Welcome: wrong number',
  render: () => (
    <WelcomeScreen
      initialPhone="021 123 4567"
      onSubmit={async () => {
        await wait();
        return 'Use a South African mobile number, e.g. 082 123 4567';
      }}
    />
  ),
};

export const VerifyPin: Story = {
  name: 'Enter PIN (try 123456)',
  render: () => (
    <VerifyScreen
      maskedPhone="+27 82 *** **67"
      onSubmit={async (code) => {
        await wait();
        return code === '123456' ? null : 'That PIN is wrong or has expired. Ask for a new one.';
      }}
      onResend={ok}
    />
  ),
};

export const CentreSetup: Story = {
  name: 'Centre setup (3 steps)',
  render: () => <SetupScreen onSaveProfile={ok} onCreateCentre={ok} />,
};

export const AddChild: Story = {
  render: () => (
    <AddChildScreen
      today={new Date('2026-10-15')}
      groups={[
        { id: 'g1', name: 'Babies' },
        { id: 'g2', name: 'Toddlers' },
        { id: 'g3', name: 'Pre-Grade R' },
      ]}
      onSubmit={ok}
    />
  ),
};

export const Consent: Story = {
  name: 'Consent with guardian PIN (try 123456)',
  render: () => (
    <ConsentScreen
      childName="Mbali"
      guardianName="Nandi"
      onSendPin={async () => {
        await wait();
        return { sentTo: '+27 83 *** **01' };
      }}
      onConfirm={async ({ code }) => {
        await wait();
        return code === '123456' ? null : 'That PIN is wrong or has expired.';
      }}
    />
  ),
};

export const RegisterWithWaiting: Story = {
  name: 'Register: one child waiting for consent',
  render: () => (
    <ChildrenScreen
      attendance={false}
      today={new Date('2026-10-15')}
      groups={demoGroups}
      childrenList={[
        {
          id: 'w1',
          firstName: 'Mbali',
          birthMonth: '2024-03',
          group: null,
          present: null,
          status: 'awaiting_consent',
        },
        ...demoChildren.slice(0, 5).map((c) => ({ ...c, status: 'active' as const })),
      ]}
    />
  ),
};
