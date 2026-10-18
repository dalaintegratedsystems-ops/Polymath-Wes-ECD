import { desc, eq } from 'drizzle-orm';
import {
  DOCUMENT_TYPE_LABEL,
  POLICY_KINDS,
  POLICY_TITLE,
  type AuditGap,
  type ComplianceDocument,
} from '@wes/shared';
import { schema, type Transaction } from '@wes/db';
import type { BlobStore } from '../../platform/blob';
import { PdfWriter } from '../../platform/pdf';
import { currentPolicies, listDocuments, sastToday } from './service';

const PROVINCE: Record<string, string> = {
  EC: 'Eastern Cape',
  FS: 'Free State',
  GP: 'Gauteng',
  KZN: 'KwaZulu-Natal',
  LP: 'Limpopo',
  MP: 'Mpumalanga',
  NC: 'Northern Cape',
  NW: 'North West',
  WC: 'Western Cape',
};
const EXPIRY: Record<ComplianceDocument['expiry'], string> = {
  none: 'No expiry date',
  ok: 'Valid',
  soon: 'Renew soon',
  expired: 'Expired',
};
const ages = (min: number, max: number) => {
  const f = (m: number) => (m < 24 ? `${m} months` : `${Math.round(m / 12)} years`);
  return `${f(min)} to ${f(max)}`;
};

/** Total bytes of attached documents we embed; beyond this, documents are listed only. */
const MAX_EMBED_BYTES = 20 * 1024 * 1024;

/**
 * The application pack: one PDF with the centre's details, self-audit summary, approved
 * policies and photos of its documents, ready to print or share with the district office.
 */
export async function buildApplicationPack(opts: {
  tx: Transaction;
  blobs: BlobStore;
  centreId: string;
  principalName: string;
  now: Date;
}): Promise<Buffer> {
  const { tx, centreId, now } = opts;
  const [centre] = await tx.select().from(schema.centres).where(eq(schema.centres.id, centreId));
  if (!centre) throw new Error('centre not found');
  const [audit] = await tx
    .select()
    .from(schema.auditRuns)
    .where(eq(schema.auditRuns.centreId, centreId))
    .orderBy(desc(schema.auditRuns.createdAt))
    .limit(1);
  const policies = await currentPolicies(tx, centreId);
  const docs = await listDocuments(tx, centreId, now);
  const today = sastToday(now);

  const w = await PdfWriter.create({
    title: `${centre.name}: registration application pack`,
    footer: `${centre.name}  |  Application pack  |  ${today}`,
  });

  // Cover and centre details
  w.heading(centre.name, 1);
  w.text('Registration application pack', { size: 14, bold: true, gapAfter: 2 });
  w.text(`Prepared on ${today} with Polymath Wes`, { size: 10, grey: true, gapAfter: 10 });
  w.rule();
  w.heading('Centre details');
  w.rows([
    ['Name', centre.name],
    ['Address', [centre.addressLine, centre.suburb, centre.city].filter(Boolean).join(', ')],
    ['Province', PROVINCE[centre.province] ?? centre.province],
    ['Ages served', ages(centre.agesServedMinMonths, centre.agesServedMaxMonths)],
    ['Number of children', String(centre.childCount)],
    ['Principal', opts.principalName],
  ]);

  // Contents
  w.heading('What is in this pack');
  const approved = policies.filter((p) => p.status === 'approved');
  w.text(`1. Self-audit summary`, { indent: 12, gapAfter: 2 });
  w.text(`2. Policies (${approved.length} of ${POLICY_KINDS.length} approved)`, {
    indent: 12,
    gapAfter: 2,
  });
  w.text(`3. Documents (${docs.length})`, { indent: 12, gapAfter: 8 });

  // Self-audit
  w.heading('1. Self-audit summary');
  if (!audit) {
    w.text('The self-audit has not been done yet.');
  } else {
    w.text(`Done on ${audit.createdAt.toISOString().slice(0, 10)}. Score: ${audit.scorePercent}%.`);
    const gaps = audit.gaps as AuditGap[];
    if (gaps.length === 0) w.text('No open items.');
    for (const g of gaps)
      w.text(`-  ${g.title} (${g.answer === 'no' ? 'not yet' : 'not sure'})`, {
        indent: 12,
        gapAfter: 2,
      });
  }

  // Policies
  for (const kind of POLICY_KINDS) {
    const p = approved.find((x) => x.kind === kind);
    w.newPage();
    w.heading(`2. ${POLICY_TITLE[kind]}`, 1);
    if (!p) {
      w.text('Not yet approved. This policy will be added once the principal approves it.', {
        grey: true,
      });
      continue;
    }
    w.text(`Approved on ${p.approvedAt?.slice(0, 10)}`, { size: 10, grey: true, gapAfter: 8 });
    w.markdown(p.bodyMarkdown);
  }

  // Documents: a list, then each document
  w.newPage();
  w.heading('3. Documents', 1);
  if (docs.length === 0) w.text('No documents uploaded yet.', { grey: true });
  for (const d of docs) {
    w.text(
      `-  ${DOCUMENT_TYPE_LABEL[d.documentType]}: ${EXPIRY[d.expiry]}${d.expiresOn ? ` (expires ${d.expiresOn})` : ''}`,
      { indent: 12, gapAfter: 2 },
    );
  }
  let embedded = 0;
  for (const d of [...docs].reverse()) {
    if (embedded + d.sizeBytes > MAX_EMBED_BYTES) break;
    const file = await opts.blobs.get(d.blobKey);
    if (!file) continue;
    const caption = `${DOCUMENT_TYPE_LABEL[d.documentType]}${d.expiresOn ? `, expires ${d.expiresOn}` : ''}`;
    if (d.mimeType === 'image/jpeg' || d.mimeType === 'image/png') {
      await w.imagePage(caption, file.bytes, d.mimeType);
    } else if (d.mimeType === 'application/pdf') {
      await w.appendPdf(file.bytes);
    }
    embedded += d.sizeBytes;
  }
  return w.save();
}
