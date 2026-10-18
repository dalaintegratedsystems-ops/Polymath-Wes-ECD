import type { Metadata } from 'next';
import { DOCUMENT_TYPES, DOCUMENT_TYPE_LABEL, can } from '@wes/shared';
import { DocumentsView } from '@/components/views';
import { getDocuments } from '@/lib/server/data';
import { requireCentre } from '@/lib/server/session';

export const metadata: Metadata = { title: 'Documents' };
export const dynamic = 'force-dynamic';

export default async function DocumentsPage() {
  const { token, membership } = await requireCentre();
  const docs = await getDocuments(token, membership.centreId);
  return (
    <DocumentsView
      canEdit={can(membership.role, 'compliance:write')}
      types={DOCUMENT_TYPES.map((t) => ({ value: t, label: DOCUMENT_TYPE_LABEL[t] }))}
      documents={docs.map((d) => ({
        id: d.id,
        typeLabel: DOCUMENT_TYPE_LABEL[d.documentType],
        expiresOn: d.expiresOn,
        expiry: d.expiry,
        isPdf: d.mimeType === 'application/pdf',
        href: `/registration/documents/${d.id}`,
      }))}
    />
  );
}
