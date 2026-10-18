import { and, desc, eq, inArray, ne } from 'drizzle-orm';
import {
  AppError,
  EXPIRY_WARNING_DAYS,
  POLICY_KINDS,
  type AuditAnswer,
  type AuditGap,
  type AuditResult,
  type Checklist,
  type ComplianceCategory,
  type ComplianceDocument,
  type DocumentType,
  type Policy,
  type PolicyKind,
  type RegistrationProgress,
} from '@wes/shared';
import { schema, type Transaction } from '@wes/db';

const DAY_MS = 86_400_000;
const PLACEHOLDER = /^placeholder\./;

/** Areas where a missing item most affects children's safety come first. */
const URGENT: ComplianceCategory[] = ['premises', 'health_safety', 'staffing'];

export async function loadChecklist(tx: Transaction): Promise<Checklist> {
  const rows = await tx
    .select()
    .from(schema.complianceItems)
    .orderBy(schema.complianceItems.sortOrder, schema.complianceItems.code);
  const items = rows.map((r) => ({
    id: r.id,
    code: r.code,
    category: r.category,
    title: r.title,
    guidance: r.guidance,
    requiresDocument: r.requiresDocument,
    placeholder: PLACEHOLDER.test(r.code),
  }));
  return { items, isPlaceholder: items.some((i) => i.placeholder) };
}

export function computeGaps(
  checklist: Checklist,
  answers: Record<string, AuditAnswer>,
): { gaps: AuditGap[]; scorePercent: number } {
  const missing = checklist.items.filter((i) => !answers[i.code]);
  if (missing.length) {
    throw new AppError('validation_failed', `Answer every question (${missing.length} left).`, [
      { path: `body.answers.${missing[0]!.code}`, message: 'Choose yes, no or not sure' },
    ]);
  }
  const unknown = Object.keys(answers).filter((k) => !checklist.items.some((i) => i.code === k));
  if (unknown.length) {
    throw new AppError('validation_failed', 'Some answers are not on the checklist.', [
      { path: `body.answers.${unknown[0]}`, message: 'Unknown checklist item' },
    ]);
  }
  const gaps: AuditGap[] = [];
  for (const item of checklist.items) {
    const answer = answers[item.code]!;
    if (answer === 'yes') continue;
    const priority = answer === 'unsure' ? 3 : URGENT.includes(item.category) ? 1 : 2;
    gaps.push({
      code: item.code,
      title: item.title,
      category: item.category,
      answer,
      priority,
      action: item.placeholder
        ? 'Ask your district ECD office what this area needs, then upload any letters or certificates here.'
        : item.guidance,
    });
  }
  gaps.sort((a, b) => a.priority - b.priority);
  const yes = checklist.items.length - gaps.length;
  return { gaps, scorePercent: Math.round((yes / Math.max(1, checklist.items.length)) * 100) };
}

export function toAuditResult(
  row: typeof schema.auditRuns.$inferSelect,
  isPlaceholder: boolean,
): AuditResult {
  return {
    id: row.id,
    scorePercent: row.scorePercent,
    gaps: row.gaps as AuditGap[],
    isPlaceholder,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Today in South Africa (SAST has no daylight saving). */
export function sastToday(now: Date): string {
  return new Date(now.getTime() + 2 * 3_600_000).toISOString().slice(0, 10);
}

export function expiryOf(expiresOn: string | null, today: string): ComplianceDocument['expiry'] {
  if (!expiresOn) return 'none';
  if (expiresOn < today) return 'expired';
  const days = (Date.parse(expiresOn) - Date.parse(today)) / DAY_MS;
  return days <= EXPIRY_WARNING_DAYS ? 'soon' : 'ok';
}

export async function listDocuments(tx: Transaction, centreId: string, now: Date) {
  const today = sastToday(now);
  const rows = await tx
    .select({
      doc: schema.complianceDocuments,
      itemCode: schema.complianceItems.code,
    })
    .from(schema.complianceDocuments)
    .leftJoin(
      schema.complianceItems,
      eq(schema.complianceItems.id, schema.complianceDocuments.complianceItemId),
    )
    .where(eq(schema.complianceDocuments.centreId, centreId))
    .orderBy(desc(schema.complianceDocuments.createdAt));
  return rows.map(({ doc, itemCode }): ComplianceDocument & { blobKey: string } => ({
    id: doc.id,
    documentType: doc.documentType as DocumentType,
    itemCode: itemCode ?? null,
    mimeType: doc.mimeType,
    sizeBytes: doc.sizeBytes,
    issuedOn: doc.issuedOn,
    expiresOn: doc.expiresOn,
    expiry: expiryOf(doc.expiresOn, today),
    createdAt: doc.createdAt.toISOString(),
    blobKey: doc.blobKey,
  }));
}

export function publicDocument(d: ComplianceDocument & { blobKey?: string }): ComplianceDocument {
  const { blobKey: _hidden, ...rest } = d;
  void _hidden;
  return rest;
}

export function toPolicy(row: typeof schema.policies.$inferSelect): Policy {
  return {
    id: row.id,
    kind: row.kind as PolicyKind,
    title: row.title,
    status: row.status,
    bodyMarkdown: row.bodyMarkdown,
    answers: row.answers as Record<string, string>,
    approvedAt: row.approvedAt?.toISOString() ?? null,
    updatedAt: (row.updatedAt ?? row.createdAt).toISOString(),
  };
}

export async function currentPolicies(tx: Transaction, centreId: string) {
  const rows = await tx
    .select()
    .from(schema.policies)
    .where(and(eq(schema.policies.centreId, centreId), ne(schema.policies.status, 'archived')))
    .orderBy(desc(schema.policies.updatedAt));
  return rows.map(toPolicy);
}

/** Archive older versions of a policy kind so there is one current draft and one approved. */
export async function archiveOthers(
  tx: Transaction,
  centreId: string,
  kind: PolicyKind,
  keepId: string,
  statuses: ('draft' | 'approved')[],
) {
  await tx
    .update(schema.policies)
    .set({ status: 'archived', updatedAt: new Date() })
    .where(
      and(
        eq(schema.policies.centreId, centreId),
        eq(schema.policies.kind, kind),
        ne(schema.policies.id, keepId),
        inArray(schema.policies.status, statuses),
      ),
    );
}

const STEP_LABEL: Record<RegistrationProgress['steps'][number]['id'], string> = {
  audit: 'Check where you stand',
  centre: 'Centre details',
  policies: 'Write your policies',
  documents: 'Photograph your documents',
  pack: 'Review your application pack',
  submit: 'Submit to your district office',
};
export const stepLabel = (id: keyof typeof STEP_LABEL) => STEP_LABEL[id];

export async function registrationProgress(
  tx: Transaction,
  centreId: string,
  now: Date,
): Promise<RegistrationProgress> {
  const [centre] = await tx.select().from(schema.centres).where(eq(schema.centres.id, centreId));
  if (!centre) throw new AppError('not_found', 'Centre not found.');
  const [audit] = await tx
    .select({ score: schema.auditRuns.scorePercent, gaps: schema.auditRuns.gaps })
    .from(schema.auditRuns)
    .where(eq(schema.auditRuns.centreId, centreId))
    .orderBy(desc(schema.auditRuns.createdAt))
    .limit(1);
  const policies = await currentPolicies(tx, centreId);
  const approved = new Set(policies.filter((p) => p.status === 'approved').map((p) => p.kind));
  const docs = await listDocuments(tx, centreId, now);
  const expired = docs.filter((d) => d.expiry === 'expired').length;
  const soon = docs.filter((d) => d.expiry === 'soon').length;

  const centreDone = Boolean(
    centre.addressLine && centre.suburb && centre.city && centre.childCount > 0,
  );
  const done: Record<keyof typeof STEP_LABEL, boolean> = {
    audit: Boolean(audit),
    centre: centreDone,
    policies: POLICY_KINDS.every((k) => approved.has(k)),
    documents: docs.length > 0 && expired === 0,
    pack: Boolean(centre.registrationPackAt),
    submit: ['submitted', 'conditionally_registered', 'registered'].includes(
      centre.registrationStatus,
    ),
  };
  const detail: Record<keyof typeof STEP_LABEL, string> = {
    audit: audit
      ? `${(audit.gaps as unknown[]).length} ${(audit.gaps as unknown[]).length === 1 ? 'thing' : 'things'} to work on`
      : 'A few quick questions so Wes can see what is missing',
    centre: centreDone
      ? 'Address, ages and number of children saved'
      : 'Add your full address and number of children',
    policies: `${approved.size} of ${POLICY_KINDS.length} approved`,
    documents:
      docs.length === 0
        ? 'Wes reminds you before anything expires'
        : `${docs.length} saved${expired ? `, ${expired} expired` : ''}${soon ? `, ${soon} to renew soon` : ''}`,
    pack: centre.registrationPackAt
      ? 'Pack ready to print or share'
      : 'One PDF with everything together',
    submit: done.submit ? 'Submitted' : 'Take your pack to your district ECD office',
  };
  const ids = Object.keys(STEP_LABEL) as (keyof typeof STEP_LABEL)[];
  const firstOpen = ids.find((id) => !done[id]);
  return {
    percent: Math.round((ids.filter((id) => done[id]).length / ids.length) * 100),
    steps: ids.map((id) => ({
      id,
      status: done[id] ? 'done' : id === firstOpen ? 'current' : 'todo',
      detail: detail[id],
    })),
    expiringDocuments: expired + soon,
  };
}
