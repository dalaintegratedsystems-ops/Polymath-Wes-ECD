/**
 * Development seed data. Every centre, person and phone number here is FICTIONAL.
 * Phone numbers use the +27 600 000 xxx range, which is not assigned to real subscribers
 * in this project's test environments.
 *
 * Registration requirements and knowledge content are placeholders marked TODO(content):
 * we never invent registration rules or NCF content (CLAUDE.md §10).
 */
import type { Database } from './client';
import type { FieldCrypto } from './crypto';
import * as s from './schema';

const uuid = (prefix: string, n: number) =>
  `${prefix.padEnd(8, '0')}-0000-4000-8000-${String(n).padStart(12, '0')}`;

export const SEED_IDS = {
  centres: { siyakhula: uuid('c0', 1), ikhaya: uuid('c0', 2) },
  users: {
    principalNomsa: uuid('a0', 1),
    practitionerThandi: uuid('a0', 2),
    principalFatima: uuid('a0', 3),
    practitionerJohan: uuid('a0', 4),
    parentAyanda: uuid('a0', 5),
    funderLerato: uuid('a0', 6),
    adminDala: uuid('a0', 7),
  },
  groups: {
    siyakhulaBabies: uuid('b0', 1),
    siyakhulaToddlers: uuid('b0', 2),
    siyakhulaPreGradeR: uuid('b0', 3),
    ikhayaToddlers: uuid('b0', 4),
    ikhayaPreGradeR: uuid('b0', 5),
  },
  child: (n: number) => uuid('d0', n),
  guardian: (n: number) => uuid('e0', n),
} as const;

const C = SEED_IDS.centres;
const U = SEED_IDS.users;
const G = SEED_IDS.groups;

/** First name, birth month, group, centre. Names reflect the communities we serve. */
const CHILDREN: [string, string, string, string][] = [
  ['Lwazi', '2025-03', G.siyakhulaBabies, C.siyakhula],
  ['Amahle', '2025-06', G.siyakhulaBabies, C.siyakhula],
  ['Liyema', '2024-04', G.siyakhulaToddlers, C.siyakhula],
  ['Sipho', '2024-01', G.siyakhulaToddlers, C.siyakhula],
  ['Anathi', '2024-09', G.siyakhulaToddlers, C.siyakhula],
  ['Aaliyah', '2023-11', G.siyakhulaToddlers, C.siyakhula],
  ['Thando', '2022-07', G.siyakhulaPreGradeR, C.siyakhula],
  ['Kagiso', '2022-02', G.siyakhulaPreGradeR, C.siyakhula],
  ['Iminathi', '2022-10', G.siyakhulaPreGradeR, C.siyakhula],
  ['Lindiwe', '2022-05', G.siyakhulaPreGradeR, C.siyakhula],
  ['Owethu', '2023-01', G.siyakhulaPreGradeR, C.siyakhula],
  ['Zian', '2024-02', G.ikhayaToddlers, C.ikhaya],
  ['Imaan', '2024-05', G.ikhayaToddlers, C.ikhaya],
  ['Mieke', '2023-12', G.ikhayaToddlers, C.ikhaya],
  ['Riyaad', '2024-08', G.ikhayaToddlers, C.ikhaya],
  ['Chanté', '2022-03', G.ikhayaPreGradeR, C.ikhaya],
  ['Junaid', '2022-08', G.ikhayaPreGradeR, C.ikhaya],
  ['Nokuthula', '2022-11', G.ikhayaPreGradeR, C.ikhaya],
  ['Ethan', '2023-02', G.ikhayaPreGradeR, C.ikhaya],
  ['Zara', '2022-06', G.ikhayaPreGradeR, C.ikhaya],
];

const COMPLIANCE_CATEGORIES = [
  ['premises', 'Premises and space'],
  ['health_safety', 'Health and safety'],
  ['staffing', 'Staff and training'],
  ['programme', 'Daily programme and learning'],
  ['governance', 'Management and records'],
  ['documents', 'Supporting documents'],
] as const;

/** Most recent `count` weekdays up to and including `from`. */
function recentWeekdays(from: Date, count: number): string[] {
  const days: string[] = [];
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  while (days.length < count) {
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) days.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return days.reverse();
}

export async function seed(
  db: Database,
  crypto: FieldCrypto,
  options: { today?: Date } = {},
): Promise<{ children: number; attendanceDays: number }> {
  const today = options.today ?? new Date();

  await db.transaction(async (tx) => {
    await tx.insert(s.centres).values([
      {
        id: C.siyakhula,
        name: 'Siyakhula Educare (demo)',
        addressLine: '12 Example Street',
        suburb: 'Khayelitsha',
        city: 'Cape Town',
        province: 'WC',
        agesServedMinMonths: 6,
        agesServedMaxMonths: 60,
        childCount: 11,
        registrationStatus: 'in_progress',
        defaultLocale: 'en',
      },
      {
        id: C.ikhaya,
        name: 'Ikhaya Lethu Day Care (demo)',
        addressLine: '4 Sample Road',
        suburb: 'Mitchells Plain',
        city: 'Cape Town',
        province: 'WC',
        agesServedMinMonths: 18,
        agesServedMaxMonths: 60,
        childCount: 9,
        registrationStatus: 'not_started',
        defaultLocale: 'en',
      },
    ]);

    await tx.insert(s.users).values([
      { id: U.principalNomsa, phoneE164: '+27600000001', displayName: 'Nomsa', locale: 'en' },
      { id: U.practitionerThandi, phoneE164: '+27600000002', displayName: 'Thandi', locale: 'xh' },
      { id: U.principalFatima, phoneE164: '+27600000003', displayName: 'Fatima', locale: 'en' },
      { id: U.practitionerJohan, phoneE164: '+27600000004', displayName: 'Johan', locale: 'af' },
      { id: U.parentAyanda, phoneE164: '+27600000005', displayName: 'Ayanda', locale: 'zu' },
      { id: U.funderLerato, phoneE164: '+27600000006', displayName: 'Lerato', locale: 'en' },
      {
        id: U.adminDala,
        phoneE164: '+27600000007',
        displayName: 'Dala Admin',
        locale: 'en',
        isPlatformAdmin: true,
      },
    ]);

    await tx.insert(s.memberships).values([
      { userId: U.principalNomsa, centreId: C.siyakhula, role: 'principal' },
      { userId: U.practitionerThandi, centreId: C.siyakhula, role: 'practitioner' },
      { userId: U.principalFatima, centreId: C.ikhaya, role: 'principal' },
      { userId: U.practitionerJohan, centreId: C.ikhaya, role: 'practitioner' },
      { userId: U.parentAyanda, centreId: C.siyakhula, role: 'parent' },
      { userId: U.funderLerato, centreId: C.siyakhula, role: 'funder' },
      { userId: U.funderLerato, centreId: C.ikhaya, role: 'funder' },
    ]);

    await tx.insert(s.groups).values([
      {
        id: G.siyakhulaBabies,
        centreId: C.siyakhula,
        name: 'Babies',
        ageBandMinMonths: 0,
        ageBandMaxMonths: 18,
      },
      {
        id: G.siyakhulaToddlers,
        centreId: C.siyakhula,
        name: 'Toddlers',
        ageBandMinMonths: 18,
        ageBandMaxMonths: 36,
      },
      {
        id: G.siyakhulaPreGradeR,
        centreId: C.siyakhula,
        name: 'Pre-Grade R',
        ageBandMinMonths: 36,
        ageBandMaxMonths: 60,
      },
      {
        id: G.ikhayaToddlers,
        centreId: C.ikhaya,
        name: 'Toddlers',
        ageBandMinMonths: 18,
        ageBandMaxMonths: 36,
      },
      {
        id: G.ikhayaPreGradeR,
        centreId: C.ikhaya,
        name: 'Pre-Grade R',
        ageBandMinMonths: 36,
        ageBandMaxMonths: 60,
      },
    ]);

    // Guardian #1 is Ayanda (the parent user) for the first two Siyakhula children.
    const guardians = CHILDREN.map(([firstName, , , centreId], i) => {
      const n = i + 1;
      const phone = n <= 2 ? '+27600000005' : `+27600001${String(n).padStart(3, '0')}`;
      return {
        id: SEED_IDS.guardian(n),
        centreId,
        userId: n <= 2 ? U.parentAyanda : null,
        displayName: n <= 2 ? 'Ayanda' : `Parent of ${firstName}`,
        phoneCiphertext: crypto.encrypt(phone),
        phoneBlindIndex: crypto.blindIndex(phone),
      };
    });
    // Ayanda has one guardian row (shared phone) — de-duplicate on the blind index.
    const uniqueGuardians = guardians.filter(
      (g, i) =>
        guardians.findIndex(
          (o) => o.phoneBlindIndex === g.phoneBlindIndex && o.centreId === g.centreId,
        ) === i,
    );
    await tx.insert(s.guardians).values(uniqueGuardians);

    await tx.insert(s.children).values(
      CHILDREN.map(([firstName, birthMonth, groupId, centreId], i) => ({
        id: SEED_IDS.child(i + 1),
        centreId,
        firstName,
        birthMonth,
        groupId,
      })),
    );

    const guardianFor = (i: number) => (i < 2 ? SEED_IDS.guardian(1) : SEED_IDS.guardian(i + 1));

    await tx.insert(s.childGuardians).values(
      CHILDREN.map(([, , , centreId], i) => ({
        childId: SEED_IDS.child(i + 1),
        guardianId: guardianFor(i),
        centreId,
        relationship: i % 5 === 3 ? ('grandparent' as const) : ('mother' as const),
      })),
    );

    await tx.insert(s.consents).values(
      CHILDREN.map(([, , , centreId], i) => ({
        centreId,
        childId: SEED_IDS.child(i + 1),
        guardianId: guardianFor(i),
        purposes: ['child_record', 'parent_messages'],
        method: 'guardian_otp' as const,
        capturedByUserId: centreId === C.siyakhula ? U.principalNomsa : U.principalFatima,
      })),
    );

    const days = recentWeekdays(today, 5);
    const records = days.flatMap((day, d) =>
      CHILDREN.map(([, , , centreId], i) => ({
        centreId,
        childId: SEED_IDS.child(i + 1),
        day,
        // Deterministic, realistic pattern: roughly 85% present.
        status: (i + d) % 7 === 0 ? ('absent' as const) : ('present' as const),
        recordedByUserId: centreId === C.siyakhula ? U.practitionerThandi : U.practitionerJohan,
        clientUpdatedAt: new Date(`${day}T08:30:00+02:00`),
      })),
    );
    await tx.insert(s.attendanceRecords).values(records);

    await tx.insert(s.complianceItems).values(
      COMPLIANCE_CATEGORIES.map(([category, title], i) => ({
        code: `placeholder.${category}`,
        category,
        title,
        guidance:
          'TODO(content): replace with the official requirement text and source from the DBE document set.',
        sortOrder: i,
      })),
    );

    await tx.insert(s.knowledgeSources).values({
      slug: 'placeholder-ncf',
      title: 'PLACEHOLDER — National Curriculum Framework (birth to four)',
      publisher: 'TODO(content): Department of Basic Education',
      kind: 'placeholder',
      corpusVersion: '0.0.0-placeholder',
      contentSha256: '0'.repeat(64),
      isPlaceholder: true,
    });
  });

  return { children: CHILDREN.length, attendanceDays: 5 };
}
