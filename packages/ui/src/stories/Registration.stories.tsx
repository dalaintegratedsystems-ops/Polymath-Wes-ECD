import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  DocumentsScreen,
  PackScreen,
  PoliciesScreen,
  PolicyScreen,
  SelfAuditScreen,
  SubmitScreen,
} from '../screens/RegistrationSteps';

const meta: Meta = { title: 'Registration steps', parameters: { layout: 'fullscreen' } };
export default meta;
type Story = StoryObj;

const ok = async () => null;
const items = [
  ['premises', 'Premises and space'],
  ['health_safety', 'Health and safety'],
  ['staffing', 'Staff and training'],
  ['programme', 'Daily programme and learning'],
  ['governance', 'Management and records'],
  ['documents', 'Supporting documents'],
].map(([c, title]) => ({
  code: `placeholder.${c}`,
  title: title!,
  guidance: '',
  placeholder: true,
}));

export const SelfAuditQuestions: Story = {
  render: () => <SelfAuditScreen items={items} isPlaceholder latest={null} canRun onSubmit={ok} />,
};

export const SelfAuditResult: Story = {
  render: () => (
    <SelfAuditScreen
      items={items}
      isPlaceholder
      canRun
      onSubmit={ok}
      latest={{
        scorePercent: 67,
        createdAt: '2026-10-18T08:00:00Z',
        gaps: [
          {
            code: 'placeholder.health_safety',
            title: 'Health and safety',
            answer: 'no',
            priority: 1,
            action:
              'Ask your district ECD office what this area needs, then upload any letters or certificates here.',
          },
          {
            code: 'placeholder.documents',
            title: 'Supporting documents',
            answer: 'unsure',
            priority: 3,
            action:
              'Ask your district ECD office what this area needs, then upload any letters or certificates here.',
          },
        ],
      }}
    />
  ),
};

export const Policies: Story = {
  render: () => (
    <PoliciesScreen
      policies={[
        { kind: 'admissions', title: 'Admissions policy', status: 'approved' },
        { kind: 'health', title: 'Health policy', status: 'draft' },
        { kind: 'safety', title: 'Safety policy', status: 'missing' },
        { kind: 'child_protection', title: 'Child protection policy', status: 'missing' },
      ]}
    />
  ),
};

export const PolicyDraft: Story = {
  render: () => (
    <PolicyScreen
      title="Child protection policy"
      questions={[]}
      initialAnswers={{}}
      canEdit
      canApprove
      pdfHref="#"
      onGenerate={ok}
      onSaveText={ok}
      onApprove={ok}
      policy={{
        id: 'p1',
        title: 'Child protection policy',
        status: 'draft',
        approvedAt: null,
        bodyMarkdown:
          '## Purpose\n\nEvery child has the right to be safe.\n\n## Our designated person\n\nNomsa is our designated child protection person.\n\n- Childline: 116 (free, day and night).',
      }}
    />
  ),
};

export const Documents: Story = {
  render: () => (
    <DocumentsScreen
      canEdit
      onUpload={ok}
      onDelete={ok}
      types={[
        { value: 'fire_clearance', label: 'Fire safety clearance' },
        { value: 'other', label: 'Other document' },
      ]}
      documents={[
        {
          id: '1',
          typeLabel: 'Fire safety clearance',
          expiresOn: '2026-11-01',
          expiry: 'soon',
          isPdf: false,
          href: '#',
        },
        {
          id: '2',
          typeLabel: 'NPO registration',
          expiresOn: null,
          expiry: 'none',
          isPdf: true,
          href: '#',
        },
      ]}
    />
  ),
};

export const Pack: Story = {
  render: () => (
    <PackScreen
      canBuild
      downloadAction="#"
      builtAt={null}
      checks={[
        { label: 'Self-audit done', ok: true, href: '#' },
        { label: 'Centre details complete', ok: true, href: '#' },
        { label: 'Policies: 2 of 4 approved', ok: false, href: '#' },
        { label: 'Documents: 2 saved', ok: true, href: '#' },
      ]}
    />
  ),
};

export const Submitted: Story = {
  render: () => <SubmitScreen submitted canSubmit onMarkSubmitted={ok} />,
};
