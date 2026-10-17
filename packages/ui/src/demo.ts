/**
 * Demo data for Storybook and the Milestone 0 PWA, matching the database seed.
 * All names are fictional. Registration steps describe Wes's own workflow, not official
 * rules; ELDA labels and sources are placeholders until the curated NCF corpus lands.
 */
import type { JourneyStep } from './progress';
import type { HomeData } from './screens/HomeScreen';
import type { ChildRow } from './screens/ChildrenScreen';
import type { WeekPlan } from './screens/PlanScreen';
import type { ChatMessage } from './screens/WesScreen';

export const demoHome: HomeData = {
  userName: 'Nomsa',
  centreName: 'Siyakhula Educare',
  dateLabel: 'Thursday 15 October',
  hour: 8,
  registration: {
    percent: 58,
    stepsLeft: 3,
    nextStep: 'Finish your child-protection policy draft.',
  },
  attendance: { present: 9, total: 11 },
  plan: {
    theme: 'Water play',
    today: 'Floating and sinking',
    eldas: ['Exploring maths', 'Knowledge of the world'],
  },
  suggestions: [
    'Make number flashcards',
    'Plan next week',
    'Which documents do I need?',
    'Ideas for a rainy day',
  ],
  demo: true,
};

export const demoSteps: JourneyStep[] = [
  {
    id: 'audit',
    title: 'Check where you stand',
    detail: 'Self-audit done — 4 gaps found',
    status: 'done',
  },
  {
    id: 'centre',
    title: 'Centre details',
    detail: 'Address, ages and number of children',
    status: 'done',
  },
  {
    id: 'policies',
    title: 'Write your policies',
    detail: '2 of 4 drafted with Wes',
    status: 'current',
  },
  {
    id: 'documents',
    title: 'Photograph your documents',
    detail: 'Wes reminds you before anything expires',
    status: 'todo',
  },
  {
    id: 'pack',
    title: 'Review your application pack',
    detail: 'One PDF with everything together',
    status: 'todo',
  },
  { id: 'submit', title: 'Submit to your district office', status: 'todo' },
];

const CHILDREN: [string, string, string][] = [
  ['Lwazi', '2025-03', 'Babies'],
  ['Amahle', '2025-06', 'Babies'],
  ['Liyema', '2024-04', 'Toddlers'],
  ['Sipho', '2024-01', 'Toddlers'],
  ['Anathi', '2024-09', 'Toddlers'],
  ['Aaliyah', '2023-11', 'Toddlers'],
  ['Thando', '2022-07', 'Pre-Grade R'],
  ['Kagiso', '2022-02', 'Pre-Grade R'],
  ['Iminathi', '2022-10', 'Pre-Grade R'],
  ['Lindiwe', '2022-05', 'Pre-Grade R'],
  ['Owethu', '2023-01', 'Pre-Grade R'],
];

export const demoChildren: ChildRow[] = CHILDREN.map(([firstName, birthMonth, group], i) => ({
  id: `child-${i + 1}`,
  firstName,
  birthMonth,
  group,
  present: i === 3 || i === 8 ? null : true,
}));

export const demoGroups = ['Babies', 'Toddlers', 'Pre-Grade R'];

export const demoPlan: WeekPlan = {
  theme: 'Water play',
  weekLabel: 'Week of 12 October',
  citation: 'Linked to the NCF (placeholder source — real citations in Milestone 4)',
  days: [
    {
      key: 'mon',
      short: 'Mon',
      activities: [
        {
          id: 'm1',
          time: '08:30',
          title: 'Morning ring: where do we find water?',
          eldas: ['Communication'],
          materials: [],
        },
        {
          id: 'm2',
          time: '10:00',
          title: 'Pouring and measuring',
          eldas: ['Exploring maths'],
          materials: ['plastic bottles', 'yoghurt tubs', 'a basin'],
        },
      ],
    },
    {
      key: 'tue',
      short: 'Tue',
      activities: [
        {
          id: 't1',
          time: '09:00',
          title: 'Rain song and actions',
          eldas: ['Creativity', 'Well-being'],
          materials: [],
        },
        {
          id: 't2',
          time: '10:30',
          title: 'Paint with water on the wall',
          eldas: ['Creativity'],
          materials: ['old paintbrushes', 'a bucket'],
        },
      ],
    },
    {
      key: 'wed',
      short: 'Wed',
      activities: [
        {
          id: 'w1',
          time: '09:30',
          title: 'Who uses water? Story time',
          eldas: ['Identity and belonging'],
          materials: [],
        },
      ],
    },
    {
      key: 'thu',
      short: 'Thu',
      activities: [
        {
          id: 'h1',
          time: '08:30',
          title: 'Floating and sinking',
          eldas: ['Knowledge of the world', 'Exploring maths'],
          materials: ['bottle caps', 'stones', 'corks', 'a basin of water'],
          printable: 'sorting sheet',
        },
        {
          id: 'h2',
          time: '10:30',
          title: 'Count the raindrops',
          eldas: ['Exploring maths'],
          materials: ['chalk'],
          printable: 'number cards',
        },
      ],
    },
    {
      key: 'fri',
      short: 'Fri',
      activities: [
        {
          id: 'f1',
          time: '09:00',
          title: 'Water-wise: washing hands song',
          eldas: ['Well-being'],
          materials: ['soap', 'a jug'],
        },
      ],
    },
  ],
};

export const demoChat: ChatMessage[] = [
  { id: 'u0', role: 'user', text: 'Which policies do I need for registration?' },
  {
    id: 'w0',
    role: 'wes',
    text: 'Good question! Your application usually needs a set of written policies, like admissions and child protection.\n\nI’ll check the exact list against the official guidance once it’s loaded, and show you the source.',
    citations: [{ n: 1, title: 'Registration guidance (placeholder)', anchor: 'Policies' }],
  },
];

export const demoSuggestions = [
  'Make number flashcards',
  'Plan next week',
  'Ideas for a rainy day',
];

/** The fixed safety response, for Storybook (the real one comes from the agent). */
export const escalationDemo = [
  'Thank you for telling me. What you describe could mean a child is not safe. Acting on it is the right thing to do.',
  '',
  '1. If the child is in danger right now, keep them with a safe adult and call the police on 10111.',
  '2. Tell your centre’s child-protection person today.',
  '3. Report it to a social worker at your local Department of Social Development office, or call Childline on 116 (free, 24 hours).',
  '4. Write down what you saw or heard, in the child’s own words, with the date and time.',
].join('\n');
