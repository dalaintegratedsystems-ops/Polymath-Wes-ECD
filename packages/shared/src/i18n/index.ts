import type { Locale } from '../schemas/common';
import en from './messages/en.json';
import af from './messages/af.json';
import xh from './messages/xh.json';
import zu from './messages/zu.json';

/**
 * ICU MessageFormat strings. English is the source of truth; other locales may be
 * partial and fall back to English per key until translated and reviewed.
 */
export type MessageKey = keyof typeof en;
type Messages = Record<MessageKey, string>;

const catalogs: Record<Locale, Partial<Messages>> = { en, af, xh, zu };

export function getMessages(locale: Locale): Messages {
  return { ...en, ...catalogs[locale] } as Messages;
}

/** Locales whose catalogue covers every English key. */
export function missingKeys(locale: Locale): MessageKey[] {
  const catalog = catalogs[locale];
  return (Object.keys(en) as MessageKey[]).filter((k) => !(k in catalog));
}
