import { PDFDocument } from 'pdf-lib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SEED_IDS } from '@wes/db';
import { bearer, createHarness, idem, signIn, type Harness } from './helpers';

let h: Harness;
let nomsa: string;
let thandi: string;
let fatima: string;
let ayanda: string;

const C = SEED_IDS.centres;
const at = (token: string, centre: string = C.siyakhula) => ({
  ...bearer(token),
  'x-centre-id': centre,
});

// A tiny JPEG with an EXIF segment carrying a fake GPS marker.
const JPEG = Buffer.concat([
  Buffer.from([0xff, 0xd8]),
  Buffer.from([0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]),
  Buffer.from([0xff, 0xe1, 0x00, 0x10]),
  Buffer.from('Exif\0\0GPS-TEST', 'ascii'),
  Buffer.from([0xff, 0xda, 0x00, 0x02, 0x11, 0x22, 0xff, 0xd9]),
]);

beforeAll(async () => {
  h = await createHarness();
  nomsa = (await signIn(h, '+27600000001')).accessToken;
  thandi = (await signIn(h, '+27600000002')).accessToken;
  fatima = (await signIn(h, '+27600000003')).accessToken;
  ayanda = (await signIn(h, '+27600000005')).accessToken;
});
afterAll(async () => h.close());

describe('checklist and self-audit', () => {
  it('serves the placeholder checklist, clearly labelled', async () => {
    const res = await h.app.inject({
      method: 'GET',
      url: '/v1/compliance/checklist',
      headers: at(thandi),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.isPlaceholder).toBe(true);
    expect(body.items.length).toBe(6);
    expect(body.items.every((i: { placeholder: boolean }) => i.placeholder)).toBe(true);
  });

  it('needs every question answered', async () => {
    const res = await h.app.inject({
      method: 'POST',
      url: '/v1/compliance/audit',
      headers: { ...at(nomsa), ...idem() },
      payload: { answers: { 'placeholder.premises': 'yes' } },
    });
    expect(res.statusCode).toBe(422);
  });

  it('turns answers into a prioritised gap list and a score', async () => {
    const checklist = (
      await h.app.inject({ method: 'GET', url: '/v1/compliance/checklist', headers: at(nomsa) })
    ).json().items as { code: string }[];
    const answers: Record<string, string> = Object.fromEntries(
      checklist.map((i) => [i.code, 'yes']),
    );
    answers['placeholder.governance'] = 'no';
    answers['placeholder.health_safety'] = 'no';
    answers['placeholder.documents'] = 'unsure';
    const res = await h.app.inject({
      method: 'POST',
      url: '/v1/compliance/audit',
      headers: { ...at(nomsa), ...idem() },
      payload: { answers },
    });
    expect(res.statusCode).toBe(201);
    const audit = res.json();
    expect(audit.scorePercent).toBe(50);
    expect(audit.gaps.map((g: { code: string; priority: number }) => [g.code, g.priority])).toEqual(
      [
        ['placeholder.health_safety', 1],
        ['placeholder.governance', 2],
        ['placeholder.documents', 3],
      ],
    );
    const latest = await h.app.inject({
      method: 'GET',
      url: '/v1/compliance/audit/latest',
      headers: at(thandi),
    });
    expect(latest.json().id).toBe(audit.id);
  });

  it('keeps practitioners from running the audit and other centres from reading it', async () => {
    const prac = await h.app.inject({
      method: 'POST',
      url: '/v1/compliance/audit',
      headers: { ...at(thandi), ...idem() },
      payload: { answers: {} },
    });
    expect(prac.statusCode).toBe(403);
    const other = await h.app.inject({
      method: 'GET',
      url: '/v1/compliance/audit/latest',
      headers: at(fatima, C.ikhaya),
    });
    expect(other.statusCode).toBe(404);
    const parent = await h.app.inject({
      method: 'GET',
      url: '/v1/compliance/checklist',
      headers: at(ayanda),
    });
    expect(parent.statusCode).toBe(403);
  });
});

describe('documents', () => {
  let docId = '';

  it('saves a photo without its metadata and flags expiry', async () => {
    const res = await h.app.inject({
      method: 'POST',
      url: '/v1/compliance/documents?type=fire_clearance&expiresOn=2026-11-01&itemCode=placeholder.health_safety',
      headers: { ...at(nomsa), 'content-type': 'image/jpeg' },
      payload: JPEG,
    });
    expect(res.statusCode).toBe(201);
    const doc = res.json();
    expect(doc).toMatchObject({
      documentType: 'fire_clearance',
      expiry: 'soon',
      itemCode: 'placeholder.health_safety',
    });
    expect(doc).not.toHaveProperty('blobKey');
    docId = doc.id;
    const file = await h.app.inject({
      method: 'GET',
      url: `/v1/compliance/documents/${docId}/file`,
      headers: at(thandi),
    });
    expect(file.statusCode).toBe(200);
    expect(file.rawPayload.includes(Buffer.from('GPS-TEST'))).toBe(false);
  });

  it('accepts PDFs, refuses fakes and checks dates', async () => {
    const pdf = await PDFDocument.create();
    pdf.addPage();
    const ok = await h.app.inject({
      method: 'POST',
      url: '/v1/compliance/documents?type=npo_registration',
      headers: { ...at(nomsa), 'content-type': 'application/pdf' },
      payload: Buffer.from(await pdf.save()),
    });
    expect(ok.statusCode).toBe(201);
    expect(ok.json().expiry).toBe('none');
    const fake = await h.app.inject({
      method: 'POST',
      url: '/v1/compliance/documents?type=other',
      headers: { ...at(nomsa), 'content-type': 'image/jpeg' },
      payload: Buffer.from('<html>not a photo</html>'),
    });
    expect(fake.statusCode).toBe(422);
    const dates = await h.app.inject({
      method: 'POST',
      url: '/v1/compliance/documents?type=other&issuedOn=2026-10-10&expiresOn=2026-01-01',
      headers: { ...at(nomsa), 'content-type': 'image/jpeg' },
      payload: JPEG,
    });
    expect(dates.statusCode).toBe(422);
  });

  it('lists documents only for their own centre', async () => {
    const mine = await h.app.inject({
      method: 'GET',
      url: '/v1/compliance/documents',
      headers: at(thandi),
    });
    expect(mine.json().items).toHaveLength(2);
    const theirs = await h.app.inject({
      method: 'GET',
      url: '/v1/compliance/documents',
      headers: at(fatima, C.ikhaya),
    });
    expect(theirs.json().items).toHaveLength(0);
    const sneaky = await h.app.inject({
      method: 'GET',
      url: `/v1/compliance/documents/${docId}/file`,
      headers: at(fatima, C.ikhaya),
    });
    expect(sneaky.statusCode).toBe(404);
  });
});

describe('policies', () => {
  let policyId = '';

  it('drafts a child protection policy from answers, with emergency numbers and a review note', async () => {
    const res = await h.app.inject({
      method: 'POST',
      url: '/v1/policies/generate',
      headers: { ...at(nomsa), ...idem() },
      payload: {
        kind: 'child_protection',
        answers: {
          designated: 'Nomsa Dlamini',
          reporting: 'Tell Nomsa the same day, in private.',
          screening: 'We check two references and a clearance certificate.',
        },
      },
    });
    expect(res.statusCode).toBe(201);
    const p = res.json();
    expect(p.status).toBe('draft');
    expect(p.bodyMarkdown).toContain('Nomsa Dlamini is our designated child protection person');
    expect(p.bodyMarkdown).toContain('116');
    expect(p.bodyMarkdown).toContain('check it against the official requirements');
    policyId = p.id;
  });

  it('refuses missing answers and markup in answers', async () => {
    const missing = await h.app.inject({
      method: 'POST',
      url: '/v1/policies/generate',
      headers: { ...at(nomsa), ...idem() },
      payload: { kind: 'safety', answers: { visitors: 'Sign in' } },
    });
    expect(missing.statusCode).toBe(422);
    const res = await h.app.inject({
      method: 'POST',
      url: '/v1/policies/generate',
      headers: { ...at(nomsa), ...idem() },
      payload: {
        kind: 'safety',
        answers: {
          collection: '# Heading injection\n**bold**',
          visitors: 'Sign the book',
          drills: 'Every term',
          transport: 'no',
        },
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().bodyMarkdown).not.toContain('# Heading injection');
  });

  it('only the principal approves; editing makes it a draft again', async () => {
    const prac = await h.app.inject({
      method: 'POST',
      url: `/v1/policies/${policyId}/approve`,
      headers: { ...at(thandi), ...idem() },
    });
    expect(prac.statusCode).toBe(403);
    const ok = await h.app.inject({
      method: 'POST',
      url: `/v1/policies/${policyId}/approve`,
      headers: { ...at(nomsa), ...idem() },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().status).toBe('approved');
    const edited = await h.app.inject({
      method: 'PATCH',
      url: `/v1/policies/${policyId}`,
      headers: { ...at(nomsa), ...idem() },
      payload: { bodyMarkdown: `${ok.json().bodyMarkdown}\n\nExtra line added by the principal.` },
    });
    expect(edited.json().status).toBe('draft');
    const again = await h.app.inject({
      method: 'POST',
      url: `/v1/policies/${policyId}/approve`,
      headers: { ...at(nomsa), ...idem() },
    });
    expect(again.statusCode).toBe(200);
  });

  it('renders a policy PDF', async () => {
    const res = await h.app.inject({
      method: 'GET',
      url: `/v1/policies/${policyId}/pdf`,
      headers: at(thandi),
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    const doc = await PDFDocument.load(res.rawPayload);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
    expect(doc.getTitle()).toBe('Child protection policy');
  });
});

describe('application pack and progress', () => {
  it('reports progress through the journey', async () => {
    const res = await h.app.inject({
      method: 'GET',
      url: '/v1/compliance/progress',
      headers: at(nomsa),
    });
    expect(res.statusCode).toBe(200);
    const p = res.json();
    const status = Object.fromEntries(
      p.steps.map((s: { id: string; status: string }) => [s.id, s.status]),
    );
    expect(status.audit).toBe('done');
    expect(status.documents).toBe('done');
    expect(status.policies).not.toBe('done');
    expect(p.expiringDocuments).toBe(1);
    expect(p.steps.filter((s: { status: string }) => s.status === 'current')).toHaveLength(1);
  });

  it('builds one PDF with details, policies and documents, and marks the step done', async () => {
    const res = await h.app.inject({
      method: 'POST',
      url: '/v1/compliance/pack',
      headers: at(nomsa),
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    const doc = await PDFDocument.load(res.rawPayload);
    // cover + 4 policy pages + documents list + 1 photo page + 1 uploaded PDF page
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(8);
    const progress = (
      await h.app.inject({ method: 'GET', url: '/v1/compliance/progress', headers: at(nomsa) })
    ).json();
    expect(progress.steps.find((s: { id: string }) => s.id === 'pack').status).toBe('done');
  });

  it('keeps the pack to principals', async () => {
    const res = await h.app.inject({
      method: 'POST',
      url: '/v1/compliance/pack',
      headers: at(thandi),
    });
    expect(res.statusCode).toBe(403);
  });
});
