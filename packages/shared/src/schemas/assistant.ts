import { z } from 'zod';
import { UuidSchema } from './common';

export const AssistantMessageRequestSchema = z
  .object({
    /** Omit to start a new conversation. */
    conversationId: UuidSchema.optional(),
    text: z.string().trim().min(1).max(2000),
  })
  .meta({ id: 'AssistantMessageRequest' });

export const CitationSchema = z
  .object({
    n: z.int(),
    sourceSlug: z.string(),
    title: z.string(),
    anchor: z.string(),
    corpusVersion: z.string(),
  })
  .meta({ id: 'Citation' });
export type CitationDto = z.infer<typeof CitationSchema>;

export const AssistantTurnSchema = z
  .object({
    id: UuidSchema,
    role: z.enum(['user', 'assistant']),
    text: z.string(),
    citations: z.array(CitationSchema),
    /** True for the fixed child-protection response. */
    safety: z.boolean(),
    createdAt: z.iso.datetime(),
  })
  .meta({ id: 'AssistantTurn' });
export type AssistantTurn = z.infer<typeof AssistantTurnSchema>;

export const ConversationSchema = z
  .object({ conversationId: UuidSchema.nullable(), messages: z.array(AssistantTurnSchema) })
  .meta({ id: 'Conversation' });

export const FEEDBACK_REASONS = [
  'wrong',
  'not_helpful',
  'not_relevant_locally',
  'too_long',
  'unsafe',
  'other',
] as const;

export const FeedbackRequestSchema = z
  .object({
    messageId: UuidSchema,
    rating: z.enum(['up', 'down']),
    reason: z.enum(FEEDBACK_REASONS).optional(),
    comment: z.string().trim().max(500).optional(),
  })
  .meta({ id: 'FeedbackRequest' });

/** Server-sent events from POST /v1/assistant/messages. */
export type AssistantEvent =
  | { event: 'start'; data: { conversationId: string } }
  | { event: 'delta'; data: { text: string } }
  | { event: 'replace'; data: { text: string } }
  | { event: 'done'; data: { messageId: string; citations: CitationDto[]; safety: boolean } }
  | { event: 'error'; data: { message: string } };
