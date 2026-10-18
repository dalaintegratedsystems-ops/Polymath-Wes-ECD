import {
  WEEKDAYS,
  type AdaptTarget,
  type AdaptedActivity,
  type AgeGroup,
  type PlanActivity,
  type PlanBody,
} from '@wes/shared';

/**
 * Built-in activity ideas used when Wes is offline (and as a safety net if the model's plan
 * fails validation). Everyday, low-cost early-learning practice; ELDA tags are suggestions,
 * not curriculum claims. Nothing here comes from or quotes the NCF.
 */

type Template = Omit<PlanActivity, 'id' | 'slot' | 'title' | 'steps'> & {
  key: string;
  title: (theme: string) => string;
  steps: (theme: string) => string[];
};

const ALL: AgeGroup[] = ['babies', 'toddlers', 'preschool'];
const OLDER: AgeGroup[] = ['toddlers', 'preschool'];

const TEMPLATES: Template[] = [
  {
    key: 'ring',
    title: (t) => `Morning ring: talking about ${t}`,
    durationMinutes: 15,
    ageGroups: ALL,
    eldas: ['communicating', 'identity'],
    materials: ['One object from home that links to the theme'],
    printable: null,
    steps: (t) => [
      'Sit in a circle and greet each child by name, in their home language if you can.',
      `Show an object that links to ${t} and pass it around.`,
      'Ask open questions: What do you see? What does it remind you of?',
      'End with a greeting song the children know.',
    ],
  },
  {
    key: 'story',
    title: (t) => `Story time: a story about ${t}`,
    durationMinutes: 15,
    ageGroups: ALL,
    eldas: ['communicating', 'world'],
    materials: ['A picture book, or a story you tell yourself', 'Props from the dress-up box'],
    printable: null,
    steps: (t) => [
      `Tell or read a short story about ${t}. Use different voices for the characters.`,
      'Pause and ask: What do you think happens next?',
      'Let the children retell the story with props.',
    ],
  },
  {
    key: 'sorting',
    title: (t) => `Sorting and counting ${t} things`,
    durationMinutes: 20,
    ageGroups: OLDER,
    eldas: ['maths'],
    materials: ['Bottle tops', 'Egg boxes', 'Leaves or stones'],
    printable: 'counting',
    steps: () => [
      'Put the collection on a mat in the middle of the group.',
      'Ask children to sort the things by colour, then by size.',
      'Count each group together and ask: Which group has more?',
      'Older children can match groups to number cards.',
    ],
  },
  {
    key: 'collage',
    title: (t) => `${capitalise(t)} collage`,
    durationMinutes: 25,
    ageGroups: OLDER,
    eldas: ['creativity'],
    materials: ['Old magazines or newspaper', 'Cardboard from boxes', 'Flour and water glue'],
    printable: null,
    steps: (t) => [
      'Mix flour and water into a thick glue.',
      `Children tear paper and choose pictures that make them think of ${t}.`,
      'They stick them onto cardboard however they like. There is no wrong way.',
      'Ask each child to tell you about their picture and write their words underneath.',
    ],
  },
  {
    key: 'movement',
    title: (t) => `Outdoor play: move like ${t}`,
    durationMinutes: 20,
    ageGroups: ALL,
    eldas: ['wellbeing'],
    materials: ['Chalk or a rope for a line'],
    printable: null,
    steps: (t) => [
      'Warm up together: stretch high, touch your toes, shake your arms.',
      `Call out movements linked to ${t} for the children to copy.`,
      'Walk, hop or crawl along a chalk line or rope.',
      'Cool down lying on the ground, breathing slowly.',
    ],
  },
  {
    key: 'song',
    title: (t) => `Songs and rhymes about ${t}`,
    durationMinutes: 10,
    ageGroups: ALL,
    eldas: ['communicating', 'creativity'],
    materials: ['Shakers made from bottles and dry beans (closed tightly)'],
    printable: null,
    steps: () => [
      'Sing a song the children know and add actions.',
      'Clap the rhythm together, then softly, then loudly.',
      'Invite a child to teach a verse in their home language.',
    ],
  },
  {
    key: 'sensory',
    title: (t) => `Feel and explore: ${t} basket`,
    durationMinutes: 15,
    ageGroups: ['babies', 'toddlers'],
    eldas: ['wellbeing', 'world'],
    materials: ['A basket of safe everyday objects: wooden spoons, cloths, large lids'],
    printable: null,
    steps: () => [
      'Fill a basket with large, safe objects of different textures. Nothing small enough to swallow.',
      'Sit with the children and let them explore with hands and eyes. Stay close the whole time.',
      'Name what they touch: soft, rough, cold, smooth.',
    ],
  },
  {
    key: 'words',
    title: (t) => `${capitalise(t)} word cards`,
    durationMinutes: 15,
    ageGroups: ['preschool'],
    eldas: ['communicating'],
    materials: ['Printed word cards'],
    printable: 'flashcards',
    steps: () => [
      'Show one card at a time and say the word together.',
      'Ask children to find something in the room that starts with the same sound.',
      'Play a game: hide the cards around the room for children to find and read.',
    ],
  },
  {
    key: 'walk',
    title: (t) => `Look for ${t} outside`,
    durationMinutes: 20,
    ageGroups: OLDER,
    eldas: ['world'],
    materials: ['A paper bag for each small group'],
    printable: null,
    steps: (t) => [
      'Walk around the yard or street together, holding hands in pairs.',
      `Look and listen for things linked to ${t}. Collect safe things in the bag.`,
      'Back inside, talk about what each group found.',
    ],
  },
  {
    key: 'build',
    title: (t) => `Build it: ${t} with boxes`,
    durationMinutes: 25,
    ageGroups: OLDER,
    eldas: ['maths', 'creativity'],
    materials: ['Empty boxes and tins (smooth edges)', 'Toilet roll tubes'],
    printable: null,
    steps: (t) => [
      `Ask the children what they could build that links to ${t}.`,
      'Build together. Talk about tall and short, big and small, on top and underneath.',
      'Count how many boxes each tower uses.',
    ],
  },
  {
    key: 'pretend',
    title: (t) => `Pretend corner: ${t}`,
    durationMinutes: 25,
    ageGroups: OLDER,
    eldas: ['identity', 'communicating'],
    materials: ['Old clothes and hats', 'Empty food containers'],
    printable: null,
    steps: (t) => [
      `Set up a corner for pretend play about ${t}.`,
      'Join in for a few minutes to show how to play a role, then step back.',
      'Listen to the children and add new words to their play.',
    ],
  },
  {
    key: 'tracing',
    title: (t) => `Trace ${t} words`,
    durationMinutes: 15,
    ageGroups: ['preschool'],
    eldas: ['communicating'],
    materials: ['Printed tracing sheet', 'Crayons'],
    printable: 'tracing',
    steps: () => [
      'Say each word aloud and point to the first letter.',
      'Children trace the light letters with a crayon, from left to right.',
      'Praise effort, not neatness.',
    ],
  },
];

const SLOTS = ['Morning ring', 'Main activity', 'Afternoon'] as const;

/** For each weekday: [ring, main, afternoon] template keys, in order of preference. */
const WEEK: Record<(typeof WEEKDAYS)[number], [string[], string[], string[]]> = {
  mon: [['ring'], ['sorting', 'sensory'], ['movement']],
  tue: [['song', 'ring'], ['collage', 'sensory'], ['story']],
  wed: [['ring'], ['words', 'build', 'sensory'], ['walk', 'movement']],
  thu: [['story'], ['build', 'sensory'], ['pretend', 'song']],
  fri: [['song'], ['tracing', 'collage', 'sensory'], ['movement']],
};

function capitalise(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function fits(t: Template, groups: AgeGroup[]) {
  return t.ageGroups.some((g) => groups.includes(g));
}

export function libraryPlan(theme: string, groups: AgeGroup[]): PlanBody {
  const t = theme.trim();
  const lower = t.toLowerCase();
  const days = WEEKDAYS.map((day) => ({
    day,
    activities: WEEK[day].flatMap((choices, i) => {
      const pick =
        choices.map((k) => TEMPLATES.find((x) => x.key === k)!).find((x) => fits(x, groups)) ??
        TEMPLATES.find((x) => x.key === 'song')!;
      return [
        {
          id: `${day}-${i + 1}`,
          slot: SLOTS[i]!,
          title: pick.title(lower),
          durationMinutes: pick.durationMinutes,
          ageGroups: pick.ageGroups.filter((g) => groups.includes(g)),
          eldas: [...pick.eldas],
          materials: [...pick.materials],
          steps: pick.steps(lower),
          printable: pick.printable,
        } satisfies PlanActivity,
      ];
    }),
  }));
  const themeWords = [
    ...new Set(lower.split(/[^\p{L}]+/u).filter((w) => w.length >= 2 && w.length <= 14)),
  ].slice(0, 12);
  return { days, themeWords };
}

export function adaptActivity(a: PlanActivity, target: AdaptTarget): AdaptedActivity {
  switch (target) {
    case 'younger':
      return {
        title: `${a.title} (for younger children)`,
        steps: [
          'Show the children first, then do it together, one small step at a time.',
          ...a.steps.slice(0, 2),
          'Use big objects only: for children under 3, nothing small enough to fit through a toilet roll tube.',
        ],
        materials: a.materials,
        note: 'Keep it short (5 to 10 minutes) and follow the children’s interest.',
      };
    case 'older':
      return {
        title: `${a.title} (with a challenge)`,
        steps: [
          ...a.steps,
          'Ask each child to explain what they did and why.',
          'Let a child lead the activity for the group.',
        ],
        materials: a.materials,
        note: 'Older children enjoy taking turns as the leader and solving small problems.',
      };
    case 'outdoor':
      return {
        title: `${a.title} (outside)`,
        steps: ['Take the group outside to a safe, shaded spot.', ...a.steps],
        materials: [...a.materials.slice(0, 2), 'Sticks, leaves and stones found outside', 'Chalk'],
        note: 'Check the area for sharp or dangerous things first, and bring water.',
      };
    case 'fewer_materials':
      return {
        title: `${a.title} (with what you have)`,
        steps: a.steps,
        materials: a.materials.slice(0, 1),
        note: 'Children’s bodies, voices and things found outside work well when materials are short.',
      };
  }
}
