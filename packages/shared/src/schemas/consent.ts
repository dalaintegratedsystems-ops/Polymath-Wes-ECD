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
 * How consent was captured (ADR pending decision #3 — both supported):
 * - paper_photo: practitioner uploads a photo of the signed paper form
 * - guardian_otp: the guardian confirms on their own phone with a one-time PIN
 */
export const CONSENT_METHODS = ['paper_photo', 'guardian_otp'] as const;

export const ConsentCreateSchema = z
  .object({
    guardianId: UuidSchema,
    purposes: z.array(ConsentPurposeSchema).min(1),
    method: z.enum(CONSENT_METHODS),
    evidenceDocumentId: UuidSchema.optional(),
  })
  .refine((c) => c.purposes.includes('child_record'), {
    message: 'Consent to keep a child record is required',
    path: ['purposes'],
  })
  .refine((c) => c.method !== 'paper_photo' || c.evidenceDocumentId, {
    message: 'Upload a photo of the signed form',
    path: ['evidenceDocumentId'],
  })
  .meta({ id: 'ConsentCreate' });
export type ConsentCreate = z.infer<typeof ConsentCreateSchema>;
