import { z } from 'zod';

export const UuidSchema = z.uuid();

/** South African mobile number in E.164 form, e.g. +27821234567. */
export const SaPhoneSchema = z
  .string()
  .regex(/^\+27[6-8]\d{8}$/, 'Use a South African mobile number, e.g. +27 82 123 4567');

/** Normalise local formats ("082 123 4567", "27821234567") to E.164. */
export function normaliseSaPhone(input: string): string | null {
  const digits = input.replace(/[^\d+]/g, '');
  let e164: string;
  if (digits.startsWith('+27')) e164 = digits;
  else if (digits.startsWith('27')) e164 = `+${digits}`;
  else if (digits.startsWith('0')) e164 = `+27${digits.slice(1)}`;
  else return null;
  return SaPhoneSchema.safeParse(e164).success ? e164 : null;
}

/** Birth month only — we never store a full date of birth. */
export const BirthMonthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use YYYY-MM');

export const MonthSchema = BirthMonthSchema;

export const LOCALES = ['en', 'af', 'xh', 'zu'] as const;
export const LocaleSchema = z.enum(LOCALES);
export type Locale = z.infer<typeof LocaleSchema>;

export const PROVINCES = ['EC', 'FS', 'GP', 'KZN', 'LP', 'MP', 'NC', 'NW', 'WC'] as const;
export const ProvinceSchema = z.enum(PROVINCES);
