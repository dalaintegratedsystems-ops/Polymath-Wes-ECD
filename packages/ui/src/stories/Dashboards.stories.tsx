import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  ChangePasswordScreen,
  PasswordSignInScreen,
  PeopleScreen,
  type PersonRow,
} from '../screens/AccountScreens';
import {
  AdminConsoleScreen,
  CentreDashboardScreen,
  type AdminMetricsData,
  type CentreDashboardData,
} from '../screens/DashboardScreens';

const meta: Meta = { title: 'Dashboards and accounts', parameters: { layout: 'fullscreen' } };
export default meta;
type Story = StoryObj;

const weeks = [
  '2026-08-24',
  '2026-08-31',
  '2026-09-07',
  '2026-09-14',
  '2026-09-21',
  '2026-09-28',
  '2026-10-05',
  '2026-10-12',
];

const centre: CentreDashboardData = {
  from: '2026-09-18',
  to: '2026-10-15',
  centreName: 'Siyakhula Educare (demo)',
  registrationStatus: 'in_progress',
  childrenActive: 11,
  awaitingConsent: 2,
  consentsGranted: 4,
  staff: 3,
  parentsLinked: 6,
  wesQuestions: 31,
  wesHelpful: 14,
  wesNotHelpful: 2,
  attendanceRate: 86.5,
  weekly: weeks.map((weekStart, i) => ({
    weekStart,
    wesQuestions: [2, 4, 3, 6, 5, 8, 7, 12][i]!,
    childrenAdded: [0, 1, 0, 2, 0, 1, 0, 1][i]!,
    attendanceRate: i < 3 ? null : [80, 84, 88, 85, 90][i - 3]!,
  })),
};

const metrics: AdminMetricsData = {
  from: '2026-09-18',
  to: '2026-10-15',
  centres: {
    total: 42,
    new: 6,
    childrenActive: 1120,
    byProvince: [
      { label: 'WC', count: 18 },
      { label: 'GP', count: 12 },
      { label: 'EC', count: 8 },
      { label: 'KZN', count: 4 },
    ],
    funnel: [
      { label: 'not_started', count: 9 },
      { label: 'in_progress', count: 21 },
      { label: 'submitted', count: 7 },
      { label: 'registered', count: 5 },
    ],
  },
  users: {
    total: 188,
    new: 23,
    dau: 37,
    wau: 96,
    mau: 141,
    daily: Array.from({ length: 28 }, (_, i) => ({
      day: `2026-09-${String(18 + (i % 13)).padStart(2, '0')}`,
      active: 20 + Math.round(10 * Math.sin(i / 3)) + i,
    })),
    retention: [
      { cohort: '2026-07', size: 30, month1: 21, month2: 17 },
      { cohort: '2026-08', size: 41, month1: 30, month2: 0 },
      { cohort: '2026-09', size: 52, month1: 0, month2: 0 },
    ],
  },
  wes: {
    questions: 1290,
    costUsd: 18.42,
    tokens: 4_210_000,
    avgLatencyMs: 2300,
    errors: 3,
    escalations: 2,
    topIntents: [
      { label: 'registration', count: 480 },
      { label: 'planning', count: 390 },
      { label: 'behaviour', count: 210 },
      { label: 'printables', count: 120 },
    ],
    feedback: {
      up: 310,
      down: 41,
      reasons: [
        { label: 'too_long', count: 19 },
        { label: 'not_relevant_locally', count: 12 },
        { label: 'wrong', count: 10 },
      ],
    },
  },
};

const people: PersonRow[] = [
  {
    userId: '1',
    displayName: 'Thandi',
    username: null,
    phoneMasked: '+2760 *** **02',
    role: 'practitioner',
    centreId: 'c1',
    centreName: 'Siyakhula Educare (demo)',
    status: 'active',
    lastSeenAt: '2026-10-15T07:00:00Z',
    mustChangePassword: false,
  },
  {
    userId: '2',
    displayName: 'Sipho',
    username: 'sipho.m',
    phoneMasked: null,
    role: 'practitioner',
    centreId: 'c1',
    centreName: 'Siyakhula Educare (demo)',
    status: 'active',
    lastSeenAt: null,
    mustChangePassword: true,
  },
  {
    userId: '3',
    displayName: 'Ayanda',
    username: null,
    phoneMasked: '+2760 *** **05',
    role: 'parent',
    centreId: 'c1',
    centreName: 'Siyakhula Educare (demo)',
    status: 'deactivated',
    lastSeenAt: null,
    mustChangePassword: false,
  },
];

const ok = async () => null;

export const CentreDashboard: Story = {
  render: () => <CentreDashboardScreen data={centre} rangeDays={28} canManagePeople />,
};
export const CentreDashboardNewCentre: Story = {
  name: 'Centre dashboard: brand new',
  render: () => (
    <CentreDashboardScreen
      data={{
        ...centre,
        childrenActive: 0,
        awaitingConsent: 0,
        consentsGranted: 0,
        parentsLinked: 0,
        wesQuestions: 0,
        wesHelpful: 0,
        wesNotHelpful: 0,
        attendanceRate: null,
        weekly: centre.weekly.map((w) => ({ ...w, wesQuestions: 0, attendanceRate: null })),
      }}
      rangeDays={28}
    />
  ),
};
export const PlatformConsole: Story = {
  render: () => (
    <AdminConsoleScreen
      metrics={metrics}
      filters={{ province: 'WC' }}
      exportHref="#"
      centres={[
        {
          centreId: 'c1',
          name: 'Siyakhula Educare (demo)',
          province: 'WC',
          city: 'Khayelitsha',
          registrationStatus: 'in_progress',
          children: 11,
          staff: 3,
          wesQuestions: 31,
          costUsd: 0.42,
          lastActive: '2026-10-15',
        },
        {
          centreId: 'c2',
          name: 'Ikhaya Lethu (demo)',
          province: 'WC',
          city: 'Gugulethu',
          registrationStatus: 'registered',
          children: null,
          staff: 2,
          wesQuestions: 9,
          costUsd: 0.11,
          lastActive: null,
        },
      ]}
    />
  ),
};
export const People: Story = {
  render: () => (
    <PeopleScreen
      people={people}
      centres={[{ id: 'c1', name: 'Siyakhula Educare (demo)' }]}
      isPlatformAdmin={false}
      onCreate={async () => ({ temporaryPassword: 'kudu-mango-river-drum-42' })}
      onResetPassword={async () => ({ temporaryPassword: 'aloe-canoe-story-kettle-17' })}
      onSetStatus={ok}
    />
  ),
};
export const UsernameSignIn: Story = {
  render: () => (
    <PasswordSignInScreen onSubmit={async () => 'That username or password is wrong.'} />
  ),
};
export const ChoosePassword: Story = {
  render: () => <ChangePasswordScreen forced onSubmit={ok} />,
};
