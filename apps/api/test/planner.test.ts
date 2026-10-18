import { PDFDocument } from 'pdf-lib';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { SEED_IDS } from '@wes/db';
import { ZERO_USAGE, type ModelClient } from '@wes/agent';
import type { PlanBody } from '@wes/shared';
import { libraryPlan } from '../src/modules/planner/library';
import { bearer, createHarness, idem, signIn, type Harness } from './helpers';

let h: Harness;
let thandi: string;
let fatima: string;
let ayanda: string;
let offlineModel: ModelClient;

const C = SEED_IDS.centres;
const at = (token: string, centre: string = C.siyakhula) => ({
  ...bearer(token),
  'x-centre-id': centre,
});
const WEEK = '2026-10-19';

beforeAll(async () => {
  h = await createHarness();
  offlineModel = h.deps.agent.model;
  thandi = (await signIn(h, '+27600000002')).accessToken;
  fatima = (await signIn(h, '+27600000003')).accessToken;
  ayanda = (await signIn(h, '+27600000005')).accessToken;
});
afterEach(() => {
  h.deps.agent.model = offlineModel;
});
afterAll(async () => h.close());

const createPlan = (token: string, payload: Record<string, unknown>, centre?: string) =>
  h.app.inject({
    method: 'POST',
    url: '/v1/plans/weekly',
    headers: { ...at(token, centre), ...idem() },
    payload,
  });

describe('weekly plans', () => {
  let planId = '';

  it('drafts a five-day plan from the built-in ideas when Wes is offline', async () => {
    const res = await createPlan(thandi, {
      theme: 'Farm animals',
      ageGroups: ['toddlers', 'preschool'],
      weekStarting: WEEK,
    });
    expect(res.statusCode).toBe(201);
    const plan = res.json();
    planId = plan.id;
    expect(plan).toMatchObject({ status: 'draft', source: 'library', theme: 'Farm animals' });
    expect(plan.body.days).toHaveLength(5);
    expect(plan.body.days.every((d: { activities: unknown[] }) => d.activities.length === 3)).toBe(
      true,
    );
    expect(plan.body.themeWords).toEqual(['farm', 'animals']);
    // Placeholder sources are never cited.
    expect(plan.citations).toEqual([]);
  });

  it('keeps baby plans free of small objects and older-only activities', async () => {
    const body = libraryPlan('water', ['babies']);
    const all = body.days.flatMap((d) => d.activities);
    expect(all.every((a) => a.ageGroups.join() === 'babies')).toBe(true);
    expect(all.some((a) => a.title.includes('Sorting'))).toBe(false);
    expect(JSON.stringify(all)).not.toMatch(/bottle tops/i);
  });

  it('finds the plan for the week and lets a practitioner approve it', async () => {
    const current = await h.app.inject({
      method: 'GET',
      url: `/v1/plans/current?week=${WEEK}`,
      headers: at(thandi),
    });
    expect(current.json().id).toBe(planId);
    const ok = await h.app.inject({
      method: 'POST',
      url: `/v1/plans/${planId}/approve`,
      headers: { ...at(thandi), ...idem() },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().status).toBe('approved');
    const again = await h.app.inject({
      method: 'POST',
      url: `/v1/plans/${planId}/approve`,
      headers: { ...at(thandi), ...idem() },
    });
    expect(again.statusCode).toBe(409);
  });

  it('adapts an activity for younger children without a model', async () => {
    const res = await h.app.inject({
      method: 'POST',
      url: '/v1/activities/adapt',
      headers: at(thandi),
      payload: { planId, activityId: 'mon-2', target: 'younger' },
    });
    expect(res.statusCode).toBe(200);
    const a = res.json();
    expect(a.title).toContain('for younger children');
    expect(a.steps.join(' ')).toMatch(/toilet roll tube/);
  });

  it('refuses odd themes, parents and other centres', async () => {
    expect(
      (
        await createPlan(thandi, {
          theme: '<script>',
          ageGroups: ['preschool'],
          weekStarting: WEEK,
        })
      ).statusCode,
    ).toBe(422);
    expect(
      (await createPlan(ayanda, { theme: 'Rain', ageGroups: ['preschool'], weekStarting: WEEK }))
        .statusCode,
    ).toBe(403);
    const other = await h.app.inject({
      method: 'GET',
      url: `/v1/plans/current?week=${WEEK}`,
      headers: at(fatima, C.ikhaya),
    });
    expect(other.statusCode).toBe(404);
  });
});

describe('plans drafted by Claude', () => {
  function fakeModel(value: PlanBody | null): ModelClient {
    return {
      ...offlineModel,
      mode: 'live',
      async structured() {
        return { value: value as never, usage: ZERO_USAGE };
      },
    };
  }

  it('uses the model plan when it fits the request', async () => {
    const good = libraryPlan('rain', ['preschool']);
    good.days[0]!.activities[0]!.title = 'Listening to the rain';
    h.deps.agent.model = fakeModel(good);
    const res = await createPlan(thandi, {
      theme: 'Rain',
      ageGroups: ['preschool'],
      weekStarting: '2026-10-26',
    });
    expect(res.json()).toMatchObject({ source: 'wes' });
    expect(res.json().body.days[0].activities[0].title).toBe('Listening to the rain');
  });

  it('falls back to the built-in ideas when the model returns something unusable', async () => {
    const bad = libraryPlan('rain', ['preschool']);
    bad.days = bad.days.slice(0, 3);
    h.deps.agent.model = fakeModel(bad);
    const res = await createPlan(thandi, {
      theme: 'Rain',
      ageGroups: ['preschool'],
      weekStarting: '2026-11-02',
    });
    expect(res.json()).toMatchObject({ source: 'library' });
  });
});

describe('printables', () => {
  const print = (payload: Record<string, unknown>) =>
    h.app.inject({ method: 'POST', url: '/v1/printables', headers: at(thandi), payload });

  it('makes flashcards, tracing and counting sheets as PDFs', async () => {
    const cards = await print({
      kind: 'flashcards',
      title: 'Farm words',
      words: ['cow', 'goat', 'hen', 'pig', 'sheep', 'duck', 'horse'],
    });
    expect(cards.statusCode).toBe(200);
    expect((await PDFDocument.load(cards.rawPayload)).getPageCount()).toBe(2);
    const tracing = await print({ kind: 'tracing', title: 'Trace', words: ['molo', 'sawubona'] });
    expect((await PDFDocument.load(tracing.rawPayload)).getPageCount()).toBe(1);
    const counting = await print({ kind: 'counting', title: 'Count with me', upTo: 7 });
    expect(counting.headers['content-type']).toBe('application/pdf');
  });

  it('needs words for word sheets and refuses odd characters', async () => {
    expect((await print({ kind: 'flashcards', title: 'Empty', words: [] })).statusCode).toBe(422);
    expect((await print({ kind: 'tracing', title: 'Bad', words: ['<b>'] })).statusCode).toBe(422);
  });
});
