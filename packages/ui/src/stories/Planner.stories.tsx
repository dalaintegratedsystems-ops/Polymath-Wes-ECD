import type { Meta, StoryObj } from '@storybook/react-vite';
import { PlannerScreen, PrintablesScreen, type PlannerPlan } from '../screens/PlannerScreen';

const meta: Meta = { title: 'Planner', parameters: { layout: 'fullscreen' } };
export default meta;
type Story = StoryObj;

const activity = (id: string, slot: string, title: string) => ({
  id,
  slot,
  title,
  durationMinutes: 15,
  ages: ['Toddlers', '3 to 5'],
  eldas: ['Communicating'],
  materials: ['Bottle tops', 'Egg boxes'],
  steps: ['Sit in a circle.', 'Show the children what to do.', 'Count together.'],
  printable: null,
});

const plan: PlannerPlan = {
  id: 'p1',
  theme: 'Farm animals',
  status: 'draft',
  source: 'library',
  themeWords: ['farm', 'animals', 'cow'],
  citations: [],
  days: ['mon', 'tue', 'wed', 'thu', 'fri'].map((key) => ({
    key,
    short: key.charAt(0).toUpperCase() + key.slice(1),
    activities: [
      activity(`${key}-1`, 'Morning ring', 'Morning ring: talking about farm animals'),
      {
        ...activity(`${key}-2`, 'Main activity', 'Farm animals word cards'),
        printable: 'flashcards' as const,
      },
      activity(`${key}-3`, 'Afternoon', 'Outdoor play: move like farm animals'),
    ],
  })),
};

const props = {
  weekLabel: 'Week of 19 October to 23 October',
  weekStarting: '2026-10-19',
  todayKey: 'wed',
  canEdit: true,
  printAction: '#',
  ageOptions: [
    { value: 'babies', label: 'Babies (0 to 18 months)' },
    { value: 'toddlers', label: 'Toddlers (18 months to 3 years)' },
    { value: 'preschool', label: '3 to 5 years' },
  ],
  onCreate: async () => null,
  onApprove: async () => null,
  onAdapt: async () => ({
    title: 'Farm animals word cards (for younger children)',
    steps: ['Show the children first, then do it together.'],
    materials: ['Bottle tops'],
    note: 'Keep it short and follow the children’s interest.',
  }),
};

export const NoPlanYet: Story = { render: () => <PlannerScreen {...props} plan={null} /> };
export const DraftPlan: Story = { render: () => <PlannerScreen {...props} plan={plan} /> };
export const Printables: Story = {
  render: () => <PrintablesScreen printAction="#" suggestedWords={['farm', 'animals']} />,
};
