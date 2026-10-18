import { PDFDocument } from 'pdf-lib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SEED_IDS, type RequestContext } from '@wes/db';
import { toolServices } from '../src/modules/assistant/store';
import { bearer, createHarness, signIn, type Harness } from './helpers';

/** The domain services behind Wes's tools, as Wes would call them. */
let h: Harness;
const C = SEED_IDS.centres;
const U = SEED_IDS.users;
const thandi: RequestContext = {
  userId: U.practitionerThandi,
  centreId: C.siyakhula,
  role: 'practitioner',
};
const nomsa: RequestContext = {
  userId: U.principalNomsa,
  centreId: C.siyakhula,
  role: 'principal',
};

beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => h.close());

describe('planning tools', () => {
  it('drafts a weekly plan, adapts an activity from it, and makes a printable', async () => {
    const svc = toolServices(h.deps, thandi);
    const plan = await svc.createWeeklyPlan!({
      theme: 'Rain',
      ageGroups: ['toddlers', 'preschool'],
    });
    expect(plan).toMatchObject({ theme: 'Rain', source: 'library', link: '/plan' });
    expect(plan.days).toHaveLength(5);

    const adapted = await svc.adaptActivity!({ day: 'mon', slotNumber: 2, target: 'younger' });
    expect(adapted).toHaveProperty('title');

    const printable = await svc.generatePrintable!({
      kind: 'flashcards',
      title: 'Rain words',
      words: ['rain', 'cloud', '<b>'],
      upTo: 5,
    });
    expect(printable.link).toBe(`/plan/printables/${printable.printableId}`);
    const token = (await signIn(h, '+27600000002')).accessToken;
    const res = await h.app.inject({
      method: 'GET',
      url: `/v1/printables/${printable.printableId}/pdf`,
      headers: { ...bearer(token), 'x-centre-id': C.siyakhula },
    });
    expect(res.statusCode).toBe(200);
    expect((await PDFDocument.load(res.rawPayload)).getPageCount()).toBe(1);
  });
});

describe('register tools', () => {
  it('records marks by first name and never returns names', async () => {
    const svc = toolServices(h.deps, thandi);
    const result = await svc.recordAttendance!({
      day: null,
      marks: [
        { firstName: 'lwazi', status: 'present' },
        { firstName: 'Amahle', status: 'absent' },
        { firstName: 'Nobody', status: 'present' },
      ],
    });
    expect(result).toMatchObject({ saved: 2, notFound: 1, ambiguous: 0, day: '2026-10-15' });
    expect(JSON.stringify(result)).not.toMatch(/Lwazi|Amahle/i);
  });

  it('summarises one child without naming them, and audits the read', async () => {
    const summary = await toolServices(h.deps, thandi).childSummary!({ firstName: 'Lwazi' });
    expect(summary).toMatchObject({ found: true, consentOnFile: true });
    expect(JSON.stringify(summary)).not.toMatch(/Lwazi/i);
    const [row] = await h.db.query(
      `select count(*)::int n from audit_log where action = 'child.summary'`,
    );
    expect(row?.n).toBe(1);
    expect(await toolServices(h.deps, thandi).childSummary!({ firstName: 'Nobody' })).toEqual({
      found: false,
    });
  });
});

describe('registration tools', () => {
  it('asks for missing policy answers, then drafts the policy', async () => {
    const svc = toolServices(h.deps, nomsa);
    const missing = await svc.draftPolicy!({ kind: 'health', answers: {} });
    expect(missing).toHaveProperty('missing');
    const draft = await svc.draftPolicy!({
      kind: 'health',
      answers: {
        sick_child: 'We call the parent.',
        medicine: 'written_permission',
        clinic: 'Site B clinic',
      },
    });
    expect(draft).toMatchObject({ status: 'draft', link: '/registration/policies/health' });
  });

  it('reports the self-audit and what the application pack still needs', async () => {
    const svc = toolServices(h.deps, nomsa);
    const audit = await svc.selfAuditStatus!();
    expect(audit).toMatchObject({ done: false, link: '/registration/audit' });
    expect(audit.questions.length).toBe(6);
    const pack = await svc.applicationPack!();
    expect(pack.link).toBe('/registration/pack');
    expect(pack.missing.length).toBeGreaterThan(0);
  });
});
