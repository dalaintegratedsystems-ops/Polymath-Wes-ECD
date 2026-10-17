import { z } from 'zod';
import { UuidSchema } from './common';

/** What a guardian consents to. Each purpose can be granted or revoked independently. */
export const CONSENT_PURPOSES = [
  'child_record', // required: keep the child's register and attendance record
  'progress_tracking', // observations and progress notes
  'photos', // photos of the child's work or activities
  'parent_messages', // WhatsApp/SMS messages to the guardian
] as const;
export const ConsentPurposeSchema = z.enum(CONSENT_PURPOSES);

/**
 * How consent was captured (Milestone 0 decision #2 — both supported):
 * - guardian_otp: the guardian confirms on their own phone with a one-time PIN
 * - paper_photo: practitioner uploads a photo of the signed paper form (upload lands in M3)
 */
export const CONSENT_METHODS = ['guardian_otp', 'paper_photo'] as const;

export const ConsentCreateSchema = z
  .object({
    purposes: z.array(ConsentPurposeSchema).min(1),
    method: z.enum(CONSENT_METHODS),
    /** The PIN the guardian received, for guardian_otp. */
    code: z
      .string()
      .regex(/^\d{6}$/, 'Enter the 6-digit PIN')
      .optional(),
    evidenceDocumentId: UuidSchema.optional(),
  })
  .refine((c) => c.purposes.includes('child_record'), {
    message: 'Consent to keep a child record is required',
    path: ['purposes'],
  })
  .refine((c) => c.method !== 'guardian_otp' || c.code, {
    message: 'Enter the PIN sent to the parent or caregiver',
    path: ['code'],
  })
  .refine((c) => c.method !== 'paper_photo' || c.evidenceDocumentId, {
    message: 'Upload a photo of the signed form',
    path: ['evidenceDocumentId'],
  })
  .meta({ id: 'ConsentCreate' });
export type ConsentCreate = z.infer<typeof ConsentCreateSchema>;

export const ConsentSchema = z
  .object({
    id: UuidSchema,
    childId: UuidSchema,
    purposes: z.array(ConsentPurposeSchema),
    method: z.enum(CONSENT_METHODS),
    grantedAt: z.iso.datetime(),
    revokedAt: z.iso.datetime().nullable(),
  })
  .meta({ id: 'Consent' });
