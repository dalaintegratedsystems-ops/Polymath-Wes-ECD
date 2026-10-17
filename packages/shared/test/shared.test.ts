import { describe, expect, it } from 'vitest';
import {
  AppError,
  ConsentCreateSchema,
  can,
  getMessages,
  isFeatureEnabled,
  missingKeys,
  normaliseSaPhone,
} from '../src';

describe('roles', () => {
  it('lets principals export attendance but not parents', () => {
    expect(can('principal', 'attendance:export')).toBe(true);
    expect(can('parent', 'attendance:export')).toBe(false);
  });

  it('never gives funders or platform admins child-level reads', () => {
    expect(can('funder', 'child:read')).toBe(false);
    expect(can('admin', 'child:read')).toBe(false);
  });
});

describe('normaliseSaPhone', () => {
  it.each([
    ['082 123 4567', '+27821234567'],
    ['27821234567', '+27821234567'],
    ['+27 82 123 4567', '+27821234567'],
  ])('normalises %s', (input, expected) => {
    expect(normaliseSaPhone(input)).toBe(expected);
  });

  it('rejects landlines and foreign numbers', () => {
    expect(normaliseSaPhone('021 123 4567')).toBeNull();
    expect(normaliseSaPhone('+44 7700 900123')).toBeNull();
  });
});

describe('consent', () => {
  it('requires consent to keep a child record', () => {
    const r = ConsentCreateSchema.safeParse({
      purposes: ['photos'],
      method: 'guardian_otp',
      code: '123456',
    });
    expect(r.success).toBe(false);
  });

  it('requires the guardian PIN for OTP consent', () => {
    const r = ConsentCreateSchema.safeParse({ purposes: ['child_record'], method: 'guardian_otp' });
    expect(r.success).toBe(false);
  });

  it('requires evidence for paper consent', () => {
    const r = ConsentCreateSchema.safeParse({ purposes: ['child_record'], method: 'paper_photo' });
    expect(r.success).toBe(false);
  });

  it('accepts OTP consent with a PIN', () => {
    const r = ConsentCreateSchema.safeParse({
      purposes: ['child_record', 'parent_messages'],
      method: 'guardian_otp',
      code: '123456',
    });
    expect(r.success).toBe(true);
  });
});

describe('errors and flags', () => {
  it('maps error codes to HTTP status', () => {
    expect(new AppError('consent_required', 'x').status).toBe(412);
    expect(new AppError('not_implemented', 'x').status).toBe(501);
  });

  it('keeps every phase-2 flag off by default', () => {
    expect(isFeatureEnabled('voiceNotes')).toBe(false);
    expect(isFeatureEnabled('voiceNotes', { voiceNotes: true })).toBe(true);
  });
});

describe('i18n', () => {
  it('falls back to English for untranslated keys', () => {
    const af = getMessages('af');
    expect(af['nav.home']).toBe('Tuis');
    expect(af['nav.plan']).toBe('Plan');
  });

  it('has a complete English catalogue', () => {
    expect(missingKeys('en')).toEqual([]);
  });
});
