/**
 * The seven pipeline stages every message passes through (CLAUDE.md §5). Milestone 0
 * fixes the contracts; Milestone 2 implements them. Stages are pure functions of their
 * inputs plus injected services, so each can be unit-tested and evaluated on its own.
 */

export type Channel = 'web' | 'whatsapp' | 'sms';
export type RiskLevel = 'normal' | 'sensitive' | 'child_protection';

export interface InboundMessage {
  centreId: string;
  userId: string;
  conversationId: string;
  channel: Channel;
  text: string;
  locale?: string;
}

/** 1. Redact: names and contacts → tokens like ⟦CHILD_1⟧ before any model call. */
export interface Redaction {
  text: string;
  /** Token → original value. Never leaves the server; never sent to a model provider. */
  vault: Record<string, string>;
}

/** 2. Classify (router model, structured JSON output). */
export interface Classification {
  intent:
    | 'registration'
    | 'planning'
    | 'printable'
    | 'attendance'
    | 'child_progress'
    | 'behaviour'
    | 'general'
    | 'off_topic';
  language: 'en' | 'af' | 'xh' | 'zu' | 'other';
  risk: RiskLevel;
}

export interface Citation {
  sourceSlug: string;
  title: string;
  anchor: string;
  corpusVersion: string;
}

export interface PostCheckResult {
  schemaValid: boolean;
  citationsPresent: boolean | 'not_required';
  bannedContent: string[];
  readingLevelOk: boolean;
}

export interface AgentReply {
  text: string;
  citations: Citation[];
  attachments: { kind: 'pdf'; resourceId: string; title: string }[];
  /** True when the fixed child-protection flow ran instead of generation. */
  escalated: boolean;
  postCheck: PostCheckResult;
}

export interface PipelineStages {
  redact(msg: InboundMessage): Promise<Redaction>;
  classify(redacted: Redaction, msg: InboundMessage): Promise<Classification>;
  /** 3. Safety gate: child-protection disclosures bypass generation entirely. */
  escalate(msg: InboundMessage, c: Classification): Promise<AgentReply>;
  /** 4–5. Plan, act with tools, ground in search_knowledge results. */
  generate(redacted: Redaction, c: Classification, msg: InboundMessage): Promise<AgentReply>;
  /** 6. Post-check output. */
  postCheck(reply: AgentReply, c: Classification, msg: InboundMessage): Promise<PostCheckResult>;
  /** 1b. Re-insert redacted values for the user only. */
  restore(reply: AgentReply, redaction: Redaction): AgentReply;
  /** 7. Persist AgentRun, tool calls, latency and cost. */
  persist(run: {
    msg: InboundMessage;
    c: Classification;
    reply: AgentReply;
    latencyMs: number;
  }): Promise<void>;
}

/** Orchestration is fixed here so the safety ordering can never be skipped by a stage. */
export async function runPipeline(
  stages: PipelineStages,
  msg: InboundMessage,
): Promise<AgentReply> {
  const started = Date.now();
  const redaction = await stages.redact(msg);
  const c = await stages.classify(redaction, msg);

  let reply: AgentReply;
  if (c.risk === 'child_protection') {
    reply = await stages.escalate(msg, c);
  } else {
    reply = await stages.generate(redaction, c, msg);
    reply = { ...reply, postCheck: await stages.postCheck(reply, c, msg) };
  }

  const restored = stages.restore(reply, redaction);
  await stages.persist({ msg, c, reply, latencyMs: Date.now() - started });
  return restored;
}
