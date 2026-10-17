import { z } from 'zod';
import type { ToolDef } from './model';

/** The tool catalogue (CLAUDE.md §5). Each tool calls a domain service, never the database. */
export const TOOL_NAMES = [
  'search_knowledge',
  'get_compliance_checklist',
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
}

export interface ToolContext {
  centreId: string;
  userId: string;
  role: string;
  services: ToolServices;
  /** Hits returned so far this turn, numbered from 1 in order. */
  hits: (KnowledgeHit & { n: number })[];
  /** Set when the model asks for the child-protection flow. */
  escalationRequested: boolean;
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

/** Tools available in Milestone 2. The rest of the catalogue arrives with Milestones 3–5. */
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
