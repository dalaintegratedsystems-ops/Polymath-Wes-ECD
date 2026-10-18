import { AppError, POLICY_QUESTIONS, POLICY_TITLE, type PolicyKind } from '@wes/shared';

/**
 * Policy drafts built from the centre's own answers. They describe how this centre works;
 * they do not claim what the law requires. Every draft ends with a review section telling the
 * principal to check it with their district ECD office before approving (CLAUDE.md §2.4).
 */

export interface PolicyContext {
  centreName: string;
  principalName: string;
  todayIso: string;
}

type Answers = Record<string, string>;

/** Keep answers as plain text: no Markdown structure can be injected through a form field. */
function clean(value: string | undefined): string {
  return (value ?? '')
    .replace(/[#*_`>|[\]]/g, '')
    .replace(/\s+\n/g, '\n')
    .trim();
}

function choiceLabel(kind: PolicyKind, id: string, value: string): string {
  const q = POLICY_QUESTIONS[kind].find((x) => x.id === id);
  return q?.options?.find((o) => o.value === value)?.label ?? clean(value);
}

export function validateAnswers(kind: PolicyKind, answers: Answers): Answers {
  const out: Answers = {};
  const details: { path: string; message: string }[] = [];
  for (const q of POLICY_QUESTIONS[kind]) {
    const v = clean(answers[q.id]);
    if (q.required && !v)
      details.push({ path: `body.answers.${q.id}`, message: `${q.label} is needed` });
    if (q.type === 'choice' && v && !q.options?.some((o) => o.value === v)) {
      details.push({ path: `body.answers.${q.id}`, message: 'Choose one of the options' });
    }
    if (v) out[q.id] = v;
  }
  if (details.length) throw new AppError('validation_failed', details[0]!.message, details);
  return out;
}

const REVIEW = (ctx: PolicyContext) => `## Review

This policy was drafted with Wes from the answers ${ctx.centreName} gave. Before you approve it,
check it against the official requirements from your district ECD office and change anything
that does not match how your centre works.

- Drafted on ${ctx.todayIso}
- To be reviewed by ${ctx.principalName} at least once a year, and whenever something changes`;

const lines = (value: string) =>
  value
    .split(/\n|;/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => `- ${s}`)
    .join('\n');

const BUILDERS: Record<PolicyKind, (a: Answers, ctx: PolicyContext) => string> = {
  admissions: (a, ctx) => `## Purpose

This policy explains how ${ctx.centreName} welcomes new children and their families, so that
every family is treated fairly and knows what to expect.

## Who we accept

- Ages: ${a.ages}
- Opening hours: ${a.hours}
- Languages we use with the children: ${a.languages}

We welcome children of every background, culture, religion and ability.

## When we are full

${choiceLabel('admissions', 'waiting', a.waiting ?? '')}. We keep a waiting list and contact families in turn when a place opens.

## Enrolling

${a.enrol_documents ? `Parents bring:\n\n${lines(a.enrol_documents)}` : 'We tell parents what to bring when they first visit.'}

Before a child starts, a parent or guardian gives written consent for the centre to keep the
child's details. They can withdraw consent at any time.

## Fees

${a.fees ? a.fees : 'We do not charge fees.'}

${REVIEW(ctx)}`,

  health: (a, ctx) => `## Purpose

This policy explains how ${ctx.centreName} keeps children healthy and what we do when a child
is unwell.

## When a child becomes ill

${a.sick_child}

We contact the parent or guardian straight away. Wes does not diagnose children, and neither
do our staff: we describe what we see and suggest the family visits a clinic.

## Medicine

${choiceLabel('health', 'medicine', a.medicine ?? '')}. We record every dose: the child, the medicine, the amount, the time and who gave it.

## First aid

${a.first_aid ? `First aid trained: ${a.first_aid}.` : 'We are arranging first aid training for our team.'} A first aid kit is kept out of children’s reach.

## Emergencies

Our nearest clinic or hospital: ${a.clinic}. Parents' emergency numbers are kept up to date.

${a.meals ? `## Meals and hygiene\n\n${a.meals}\n\n` : ''}${REVIEW(ctx)}`,

  safety: (a, ctx) => `## Purpose

This policy explains how ${ctx.centreName} keeps children safe every day.

## Collecting children

${a.collection}

## Visitors

${a.visitors}

## Emergencies

We practise leaving the building safely: ${a.drills}. Exits are kept clear.

${a.outdoor ? `## Outdoor play\n\n${a.outdoor}\n\n` : ''}## Transport

${a.transport === 'with_consent' ? 'We transport children only with written consent from a parent or guardian.' : 'We do not transport children.'}

${REVIEW(ctx)}`,

  child_protection: (a, ctx) => `## Purpose

Every child has the right to be safe. This policy explains how everyone at ${ctx.centreName}
helps to protect children from harm, and what we do when we are worried about a child.

## Our designated person

${a.designated} is our designated child protection person.${a.deputy ? ` When they are away, ${a.deputy} stands in.` : ''}

## If you are worried about a child

${a.reporting}

- If a child is in immediate danger, call the police on 10111.
- Childline: 116 (free, day and night).
- Write down what you saw or heard, in the child's words, with the date and time. Do not
  question the child or investigate yourself.
- Tell the designated person the same day. They contact social services.
- Keep what you know private. Share it only with the people who need to know.

## Staff and volunteers

${a.screening}

${a.training ? `## Learning to keep children safe\n\n${a.training}\n\n` : ''}${REVIEW(ctx)}`,
};

export function draftPolicy(kind: PolicyKind, answers: Answers, ctx: PolicyContext) {
  return { title: POLICY_TITLE[kind], bodyMarkdown: BUILDERS[kind](answers, ctx).trim() };
}
