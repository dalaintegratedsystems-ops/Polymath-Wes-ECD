import { z } from 'zod';
import type { ToolDef } from './model';

/** The tool catalogue (CLAUDE.md §5). Each tool calls a domain service, never the database. */
export const TOOL_NAMES = [
  'search_knowledge',
  'get_compliance_checklist',
  'get_registration_progress',
  'run_self_audit',
  'generate_policy_draft',
  'build_application_pack',
  'create_weekly_plan',
  'adapt_activity',
  'generate_printable',
  'record_attendance',
  'get_child_summary',
  'escalate_child_protection',
  'create_reminder',
] as const;
export type ToolName = (typeof TOOL_NAMES)[number];

export interface KnowledgeHit {
  sourceSlug: string;
  title: string;
  /** Where in the source, e.g. "Section 3: Health and safety". */
  anchor: string;
  content: string;
  corpusVersion: string;
}

/** Domain services the API provides to the agent, already scoped to the caller's centre. */
export interface ToolServices {
  searchKnowledge(query: string, limit: number): Promise<KnowledgeHit[]>;
  complianceChecklist(): Promise<
    { code: string; category: string; title: string; guidance: string }[]
  >;
  createReminder(input: { message: string; dueDate: string }): Promise<{ id: string }>;
  /** The centre's registration journey and latest self-audit gaps (Milestone 3). */
  registrationProgress?(): Promise<{
    percent: number;
    steps: { step: string; status: string; detail: string }[];
    openItems: { title: string; priority: number; action: string }[];
    expiringDocuments: number;
  }>;
  /** The rest of the catalogue (Milestones 3 to 5). Optional: offline evals run without them. */
  selfAuditStatus?(): Promise<{
    done: boolean;
    scorePercent: number | null;
    openItems: { title: string; action: string }[];
    questions: string[];
    link: string;
  }>;
  draftPolicy?(input: {
    kind: PolicyKindName;
    answers: Record<string, string>;
  }): Promise<
    { policyId: string; title: string; status: 'draft'; link: string } | { missing: string[] }
  >;
  applicationPack?(): Promise<{ ready: string[]; missing: string[]; link: string }>;
  createWeeklyPlan?(input: { theme: string; ageGroups: AgeGroupName[] }): Promise<{
    planId: string;
    theme: string;
    weekStarting: string;
    source: 'wes' | 'library';
    days: { day: string; activities: string[] }[];
    link: string;
  }>;
  adaptActivity?(input: {
    day: string;
    slotNumber: number;
    target: AdaptTargetName;
  }): Promise<
    { title: string; steps: string[]; materials: string[]; note: string } | { notFound: true }
  >;
  generatePrintable?(input: {
    kind: 'flashcards' | 'tracing' | 'counting';
    title: string;
    words: string[];
    upTo: number;
  }): Promise<{ printableId: string; link: string }>;
  /** Names arrive resolved to real first names; results never contain names. */
  recordAttendance?(input: {
    day: string | null;
    marks: { firstName: string; status: 'present' | 'absent' | 'excused' }[];
  }): Promise<{
    saved: number;
    notFound: number;
    ambiguous: number;
    conflicts: number;
    day: string;
  }>;
  childSummary?(input: { firstName: string }): Promise<
    | { found: false }
    | { found: 'many' }
    | {
        found: true;
        group: string | null;
        ageMonths: number;
        daysMarked: number;
        daysPresent: number;
        consentOnFile: boolean;
      }
  >;
}

export type PolicyKindName = 'admissions' | 'health' | 'safety' | 'child_protection';
export type AgeGroupName = 'babies' | 'toddlers' | 'preschool';
export type AdaptTargetName = 'younger' | 'older' | 'outdoor' | 'fewer_materials';

export interface ToolContext {
  centreId: string;
  userId: string;
  role: string;
  services: ToolServices;
  /** Hits returned so far this turn, numbered from 1 in order. */
  hits: (KnowledgeHit & { n: number })[];
  /** Set when the model asks for the child-protection flow. */
  escalationRequested: boolean;
  /** Turns a name token (e.g. ⟦CHILD_ab12⟧) back into the real name, inside our servers only. */
  resolveName?: (tokenOrName: string) => string;
}

export interface ToolDefinition<I extends z.ZodType = z.ZodType> {
  name: ToolName;
  description: string;
  input: I;
  /** Roles allowed to trigger this tool through Wes. */
  roles: readonly string[];
  run(input: z.infer<I>, ctx: ToolContext): Promise<unknown>;
}

export function defineTool<I extends z.ZodType>(def: ToolDefinition<I>): ToolDefinition<I> {
  return def;
}

const STAFF = ['principal', 'practitioner'] as const;
const ALL = ['principal', 'practitioner', 'parent'] as const;

/** The tool catalogue: each calls a domain service the API provides, never the database. */
export const TOOLS: ToolDefinition[] = [
  defineTool({
    name: 'search_knowledge',
    description:
      'Search the curated official documents (NCF, ELDAs, registration norms and guidance). Returns numbered excerpts; cite them as [n]. Use for any question about curriculum, registration rules or subsidies.',
    // Every property required: keeps the schema valid for strict tool use.
    input: z.object({ query: z.string().min(2).max(300) }),
    roles: ALL,
    async run({ query }, ctx) {
      const found = await ctx.services.searchKnowledge(query, 5);
      if (found.length === 0)
        return { results: [], note: 'No matching official documents were found.' };
      const numbered = found.map((h) => {
        const existing = ctx.hits.find(
          (x) => x.sourceSlug === h.sourceSlug && x.anchor === h.anchor,
        );
        if (existing) return existing;
        const hit = { ...h, n: ctx.hits.length + 1 };
        ctx.hits.push(hit);
        return hit;
      });
      return {
        results: numbered.map((h) => ({
          n: h.n,
          source: h.title,
          where: h.anchor,
          excerpt: h.content,
        })),
      };
    },
  }),
  defineTool({
    name: 'get_compliance_checklist',
    description:
      'List the registration checklist items for South African ECD centres, as stored in the curated knowledge base.',
    input: z.object({}),
    roles: STAFF,
    async run(_input, ctx) {
      return { items: await ctx.services.complianceChecklist() };
    },
  }),
  defineTool({
    name: 'get_registration_progress',
    description:
      "Look up this centre's own registration progress: which journey steps are done, open items from its latest self-audit, and documents that are expired or need renewing soon. Use when the person asks what is left to do for registration.",
    input: z.object({}),
    roles: STAFF,
    async run(_input, ctx) {
      if (!ctx.services.registrationProgress)
        return { note: 'Registration progress is not available.' };
      return ctx.services.registrationProgress();
    },
  }),
  defineTool({
    name: 'create_reminder',
    description:
      'Create a reminder for the practitioner, e.g. to renew a certificate. Ask for the date if unclear.',
    input: z.object({
      message: z.string().min(3).max(200),
      dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD'),
    }),
    roles: STAFF,
    async run(input, ctx) {
      const r = await ctx.services.createReminder(input);
      return { created: true, id: r.id, dueDate: input.dueDate };
    },
  }),
  defineTool({
    name: 'run_self_audit',
    description:
      "Look up this centre's registration self-audit: whether it is done, its score, open items, and the questions it asks. The audit itself is answered by the principal in the app (Registration, Check where you stand).",
    input: z.object({}),
    roles: STAFF,
    async run(_input, ctx) {
      return ctx.services.selfAuditStatus
        ? ctx.services.selfAuditStatus()
        : { note: 'This is not available right now. Use the app instead.' };
    },
  }),
  defineTool({
    name: 'generate_policy_draft',
    description:
      "Draft one of the centre's policies (admissions, health, safety or child_protection) from the principal's own answers about how the centre works. Each answer is keyed by its question id; ask for missing answers first. Always a draft: the principal checks and approves it in the app.",
    input: z.object({
      kind: z.enum(['admissions', 'health', 'safety', 'child_protection']),
      answers: z
        .array(z.object({ question: z.string().max(40), answer: z.string().max(1000) }))
        .max(12),
    }),
    roles: ['principal'],
    async run(input, ctx) {
      return ctx.services.draftPolicy
        ? ctx.services.draftPolicy({
            kind: input.kind,
            answers: Object.fromEntries(input.answers.map((a) => [a.question, a.answer])),
          })
        : { note: 'This is not available right now. Use the app instead.' };
    },
  }),
  defineTool({
    name: 'build_application_pack',
    description:
      'Check what is ready for the registration application pack (one PDF with centre details, self-audit, approved policies and documents) and where to make it.',
    input: z.object({}),
    roles: ['principal'],
    async run(_input, ctx) {
      return ctx.services.applicationPack
        ? ctx.services.applicationPack()
        : { note: 'This is not available right now. Use the app instead.' };
    },
  }),
  defineTool({
    name: 'create_weekly_plan',
    description:
      "Draft this week's theme plan for the centre's age groups: five days of low-cost activities tagged to ELDAs. The practitioner reviews and approves it in the app (Plan).",
    input: z.object({
      theme: z.string().min(2).max(60),
      ageGroups: z
        .array(z.enum(['babies', 'toddlers', 'preschool']))
        .min(1)
        .max(3),
    }),
    roles: STAFF,
    async run(input, ctx) {
      return ctx.services.createWeeklyPlan
        ? ctx.services.createWeeklyPlan(input)
        : { note: 'This is not available right now. Use the app instead.' };
    },
  }),
  defineTool({
    name: 'adapt_activity',
    description:
      "Adapt an activity from this week's plan for younger or older children, for outdoors, or for fewer materials. day is mon to fri; slotNumber is 1 (morning ring), 2 (main) or 3 (afternoon).",
    input: z.object({
      day: z.enum(['mon', 'tue', 'wed', 'thu', 'fri']),
      slotNumber: z.int().min(1).max(3),
      target: z.enum(['younger', 'older', 'outdoor', 'fewer_materials']),
    }),
    roles: STAFF,
    async run(input, ctx) {
      return ctx.services.adaptActivity
        ? ctx.services.adaptActivity(input)
        : { note: 'This is not available right now. Use the app instead.' };
    },
  }),
  defineTool({
    name: 'generate_printable',
    description:
      'Make a low-ink A4 printable: flashcards or a tracing sheet (from up to 12 simple words) or a counting sheet (up to 10). Returns where to download it in the app.',
    input: z.object({
      kind: z.enum(['flashcards', 'tracing', 'counting']),
      title: z.string().min(2).max(60),
      words: z.array(z.string().min(1).max(14)).max(12),
      upTo: z.int().min(1).max(10),
    }),
    roles: STAFF,
    async run(input, ctx) {
      return ctx.services.generatePrintable
        ? ctx.services.generatePrintable(input)
        : { note: 'This is not available right now. Use the app instead.' };
    },
  }),
  defineTool({
    name: 'record_attendance',
    description:
      "Save register marks the practitioner tells you, e.g. who is here today. Use the children's names exactly as written. day is YYYY-MM-DD or null for today. Confirm the numbers back; never guess who is absent.",
    input: z.object({
      day: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .nullable(),
      marks: z
        .array(
          z.object({
            name: z.string().min(1).max(60),
            status: z.enum(['present', 'absent', 'excused']),
          }),
        )
        .min(1)
        .max(60),
    }),
    roles: STAFF,
    async run(input, ctx) {
      if (!ctx.services.recordAttendance)
        return { note: 'This is not available right now. Use the app instead.' };
      const resolve = ctx.resolveName ?? ((n: string) => n);
      return ctx.services.recordAttendance({
        day: input.day,
        marks: input.marks.map((m) => ({ firstName: resolve(m.name), status: m.status })),
      });
    },
  }),
  defineTool({
    name: 'get_child_summary',
    description:
      'A short, factual summary for one child in this centre: group, age in months, attendance in the last 30 days, consent on file. Never use it to judge or label a child.',
    input: z.object({ name: z.string().min(1).max(60) }),
    roles: STAFF,
    async run(input, ctx) {
      if (!ctx.services.childSummary)
        return { note: 'This is not available right now. Use the app instead.' };
      const resolve = ctx.resolveName ?? ((n: string) => n);
      return ctx.services.childSummary({ firstName: resolve(input.name) });
    },
  }),
  defineTool({
    name: 'escalate_child_protection',
    description:
      'Call immediately if the person describes possible abuse, neglect or a child in danger. Starts the fixed safety response. Takes no details.',
    input: z.object({}),
    roles: ALL,
    async run(_input, ctx) {
      ctx.escalationRequested = true;
      return { started: true };
    },
  }),
];

export function toolsForRole(role: string): ToolDefinition[] {
  return TOOLS.filter((t) => t.roles.includes(role));
}

/** Strict JSON Schema for the API (`strict: true` guarantees schema-valid inputs). */
export function toToolDef(t: ToolDefinition): ToolDef {
  const schema = z.toJSONSchema(t.input, { io: 'input', target: 'draft-2020-12' }) as Record<
    string,
    unknown
  >;
  const { $schema: _ignored, ...rest } = schema;
  return {
    name: t.name,
    description: t.description,
    strict: true,
    input_schema: {
      ...rest,
      type: 'object',
      additionalProperties: false,
    } as ToolDef['input_schema'],
  };
}
