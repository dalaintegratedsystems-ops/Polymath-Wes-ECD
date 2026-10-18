import { z } from 'zod';
import { UuidSchema } from './common';

/**
 * Registration copilot. The checklist content comes from the curated knowledge base; until the
 * DBE document set is loaded it is a clearly labelled placeholder (CLAUDE.md: never invent
 * registration rules). Everything else here is about the centre's own facts and files.
 */

export const COMPLIANCE_CATEGORIES = [
  'premises',
  'health_safety',
  'staffing',
  'programme',
  'governance',
  'documents',
] as const;
export type ComplianceCategory = (typeof COMPLIANCE_CATEGORIES)[number];

export const ComplianceItemSchema = z
  .object({
    id: UuidSchema,
    code: z.string(),
    category: z.enum(COMPLIANCE_CATEGORIES),
    title: z.string(),
    guidance: z.string(),
    requiresDocument: z.string().nullable(),
    /** True while the item is a placeholder awaiting official content. */
    placeholder: z.boolean(),
  })
  .meta({ id: 'ComplianceItem' });
export type ComplianceItem = z.infer<typeof ComplianceItemSchema>;

export const ChecklistSchema = z
  .object({ items: z.array(ComplianceItemSchema), isPlaceholder: z.boolean() })
  .meta({ id: 'Checklist' });
export type Checklist = z.infer<typeof ChecklistSchema>;

export const AUDIT_ANSWERS = ['yes', 'no', 'unsure'] as const;
export type AuditAnswer = (typeof AUDIT_ANSWERS)[number];

export const AuditRequestSchema = z
  .object({
    /** Checklist item code → answer. Every item must be answered. */
    answers: z.record(z.string().max(80), z.enum(AUDIT_ANSWERS)),
  })
  .meta({ id: 'AuditRequest' });

export const AuditGapSchema = z
  .object({
    code: z.string(),
    title: z.string(),
    category: z.enum(COMPLIANCE_CATEGORIES),
    answer: z.enum(['no', 'unsure']),
    /** 1 is most urgent. */
    priority: z.int().min(1).max(3),
    action: z.string(),
  })
  .meta({ id: 'AuditGap' });
export type AuditGap = z.infer<typeof AuditGapSchema>;

export const AuditResultSchema = z
  .object({
    id: UuidSchema,
    scorePercent: z.int(),
    gaps: z.array(AuditGapSchema),
    isPlaceholder: z.boolean(),
    createdAt: z.iso.datetime({ offset: true }),
  })
  .meta({ id: 'AuditResult' });
export type AuditResult = z.infer<typeof AuditResultSchema>;

// ---------- Documents ----------

export const DOCUMENT_TYPES = [
  'land_use',
  'health_clearance',
  'fire_clearance',
  'building_plan',
  'npo_registration',
  'constitution',
  'staff_records',
  'clearance_certificate',
  'financial',
  'other',
] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const DOCUMENT_TYPE_LABEL: Record<DocumentType, string> = {
  land_use: 'Land use or zoning letter',
  health_clearance: 'Health clearance',
  fire_clearance: 'Fire safety clearance',
  building_plan: 'Building or site plan',
  npo_registration: 'NPO registration',
  constitution: 'Constitution',
  staff_records: 'Staff qualifications',
  clearance_certificate: 'Staff clearance certificate',
  financial: 'Financial statement',
  other: 'Other document',
};

export const DOCUMENT_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
export const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;
/** Documents expiring within this many days are flagged "renew soon". */
export const EXPIRY_WARNING_DAYS = 30;

const isoDate = z.iso.date();

export const DocumentUploadQuerySchema = z
  .object({
    type: z.enum(DOCUMENT_TYPES),
    itemCode: z.string().max(80).optional(),
    issuedOn: isoDate.optional(),
    expiresOn: isoDate.optional(),
  })
  .refine((q) => !q.issuedOn || !q.expiresOn || q.issuedOn <= q.expiresOn, {
    message: 'The expiry date must be after the issue date',
    path: ['expiresOn'],
  });

export const ComplianceDocumentSchema = z
  .object({
    id: UuidSchema,
    documentType: z.enum(DOCUMENT_TYPES),
    itemCode: z.string().nullable(),
    mimeType: z.string(),
    sizeBytes: z.int(),
    issuedOn: isoDate.nullable(),
    expiresOn: isoDate.nullable(),
    /** none: no expiry date; ok; soon: within 30 days; expired. */
    expiry: z.enum(['none', 'ok', 'soon', 'expired']),
    createdAt: z.iso.datetime({ offset: true }),
  })
  .meta({ id: 'ComplianceDocument' });
export type ComplianceDocument = z.infer<typeof ComplianceDocumentSchema>;

export const ComplianceDocumentListSchema = z
  .object({ items: z.array(ComplianceDocumentSchema) })
  .meta({ id: 'ComplianceDocumentList' });

// ---------- Journey progress ----------

export const REGISTRATION_STEPS = [
  'audit',
  'centre',
  'policies',
  'documents',
  'pack',
  'submit',
] as const;
export type RegistrationStepId = (typeof REGISTRATION_STEPS)[number];

export const RegistrationProgressSchema = z
  .object({
    percent: z.int(),
    steps: z.array(
      z.object({
        id: z.enum(REGISTRATION_STEPS),
        status: z.enum(['done', 'current', 'todo']),
        detail: z.string(),
      }),
    ),
    expiringDocuments: z.int(),
  })
  .meta({ id: 'RegistrationProgress' });
export type RegistrationProgress = z.infer<typeof RegistrationProgressSchema>;

// ---------- Policies ----------

export const POLICY_KINDS = ['admissions', 'health', 'safety', 'child_protection'] as const;
export type PolicyKind = (typeof POLICY_KINDS)[number];

export const POLICY_TITLE: Record<PolicyKind, string> = {
  admissions: 'Admissions policy',
  health: 'Health policy',
  safety: 'Safety policy',
  child_protection: 'Child protection policy',
};

export interface PolicyQuestion {
  id: string;
  label: string;
  hint?: string;
  type: 'text' | 'textarea' | 'choice';
  options?: { value: string; label: string }[];
  required: boolean;
}

/**
 * Guided questions about the centre's own way of working. They never assert what the law
 * requires; the drafts say clearly that the centre must check them against official guidance.
 */
export const POLICY_QUESTIONS: Record<PolicyKind, PolicyQuestion[]> = {
  admissions: [
    {
      id: 'ages',
      label: 'Which ages do you accept?',
      hint: 'For example: 6 months to 5 years',
      type: 'text',
      required: true,
    },
    {
      id: 'hours',
      label: 'What are your opening hours?',
      hint: 'For example: 06:30 to 17:30, Monday to Friday',
      type: 'text',
      required: true,
    },
    {
      id: 'languages',
      label: 'Which languages do you use with the children?',
      type: 'text',
      required: true,
    },
    {
      id: 'waiting',
      label: 'When you are full, how do you choose who gets a place?',
      type: 'choice',
      options: [
        { value: 'first_come', label: 'First come, first served' },
        { value: 'siblings_first', label: 'Brothers and sisters first' },
        { value: 'need_first', label: 'Families with the greatest need first' },
      ],
      required: true,
    },
    {
      id: 'enrol_documents',
      label: 'What do parents bring when they enrol?',
      hint: 'For example: clinic card, birth certificate',
      type: 'textarea',
      required: false,
    },
    {
      id: 'fees',
      label: 'How do fees work?',
      hint: 'Leave empty if you do not charge fees',
      type: 'textarea',
      required: false,
    },
  ],
  health: [
    {
      id: 'sick_child',
      label: 'What happens when a child becomes ill at the centre?',
      type: 'textarea',
      required: true,
    },
    {
      id: 'medicine',
      label: 'Do staff give children medicine?',
      type: 'choice',
      options: [
        { value: 'written_permission', label: 'Only with written permission from a parent' },
        { value: 'never', label: 'No, parents give all medicine' },
      ],
      required: true,
    },
    {
      id: 'first_aid',
      label: 'Who on your team has first aid training?',
      type: 'text',
      required: false,
    },
    { id: 'clinic', label: 'Your nearest clinic or hospital', type: 'text', required: true },
    {
      id: 'meals',
      label: 'How do you prepare meals and keep the kitchen clean?',
      type: 'textarea',
      required: false,
    },
  ],
  safety: [
    {
      id: 'collection',
      label: 'Who may collect a child, and how do you check?',
      type: 'textarea',
      required: true,
    },
    {
      id: 'visitors',
      label: 'What do visitors do when they arrive?',
      type: 'textarea',
      required: true,
    },
    {
      id: 'drills',
      label: 'How often do you practise leaving the building in an emergency?',
      type: 'text',
      required: true,
    },
    {
      id: 'outdoor',
      label: 'How do you supervise outdoor play?',
      type: 'textarea',
      required: false,
    },
    {
      id: 'transport',
      label: 'Do you transport children?',
      type: 'choice',
      options: [
        { value: 'no', label: 'No' },
        { value: 'with_consent', label: 'Yes, with written parent consent' },
      ],
      required: true,
    },
  ],
  child_protection: [
    {
      id: 'designated',
      label: 'Who is your designated child protection person?',
      type: 'text',
      required: true,
    },
    { id: 'deputy', label: 'Who stands in when they are away?', type: 'text', required: false },
    {
      id: 'reporting',
      label: 'How does a staff member raise a concern about a child?',
      type: 'textarea',
      required: true,
    },
    {
      id: 'screening',
      label: 'How do you check new staff and volunteers?',
      hint: 'For example: references and clearance certificates',
      type: 'textarea',
      required: true,
    },
    {
      id: 'training',
      label: 'How do staff learn about keeping children safe?',
      type: 'textarea',
      required: false,
    },
  ],
};

export const PolicyGenerateSchema = z
  .object({
    kind: z.enum(POLICY_KINDS),
    answers: z.record(z.string().max(40), z.string().trim().max(1000)),
  })
  .meta({ id: 'PolicyGenerate' });

export const PolicySchema = z
  .object({
    id: UuidSchema,
    kind: z.enum(POLICY_KINDS),
    title: z.string(),
    status: z.enum(['draft', 'approved', 'archived']),
    bodyMarkdown: z.string(),
    answers: z.record(z.string(), z.string()),
    approvedAt: z.iso.datetime({ offset: true }).nullable(),
    updatedAt: z.iso.datetime({ offset: true }),
  })
  .meta({ id: 'Policy' });
export type Policy = z.infer<typeof PolicySchema>;

export const PolicyListSchema = z
  .object({ items: z.array(PolicySchema.omit({ bodyMarkdown: true, answers: true })) })
  .meta({ id: 'PolicyList' });

/** Strict: only the text can be edited. Editing an approved policy makes it a draft again. */
export const PolicyUpdateSchema = z
  .strictObject({
    title: z.string().trim().min(3).max(120).optional(),
    bodyMarkdown: z.string().min(20).max(30_000).optional(),
  })
  .meta({ id: 'PolicyUpdate' });
