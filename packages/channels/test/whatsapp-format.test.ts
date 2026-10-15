import { describe, expect, it } from 'vitest';
import { canSendFreeform, formatNumberedMenu, parseMenuReply, splitForWhatsApp } from '../src';

describe('splitForWhatsApp', () => {
  it('leaves short messages alone', () => {
    expect(splitForWhatsApp('Molo! How can I help?')).toEqual(['Molo! How can I help?']);
  });

  it('keeps every part under the limit and loses no words', () => {
    const para = 'Children learn through play. '.repeat(30).trim();
    const text = `${para}\n\n${para}\n\n${para}`;
    const parts = splitForWhatsApp(text, 200);
    expect(parts.every((p) => p.length <= 200)).toBe(true);
    expect(parts.join(' ').split(/\s+/).length).toBe(text.split(/\s+/).length);
  });

  it('hard-splits a single overlong word', () => {
    const parts = splitForWhatsApp('x'.repeat(250), 100);
    expect(parts.every((p) => p.length <= 100)).toBe(true);
  });
});

describe('menus', () => {
  const options = [
    { label: 'Registration help' },
    { label: 'Weekly plan' },
    { label: 'Printables' },
  ];

  it('numbers options', () => {
    expect(formatNumberedMenu('What do you need?', options)).toContain('2. Weekly plan');
  });

  it('parses replies like "2", " 2 " and "2."', () => {
    expect(parseMenuReply('2', options)?.label).toBe('Weekly plan');
    expect(parseMenuReply(' 3. ', options)?.label).toBe('Printables');
    expect(parseMenuReply('9', options)).toBeUndefined();
    expect(parseMenuReply('two', options)).toBeUndefined();
  });
});

describe('24-hour window', () => {
  const now = new Date('2026-10-15T12:00:00Z');
  it('allows freeform replies within 24 hours', () => {
    expect(canSendFreeform(new Date('2026-10-15T01:00:00Z'), now)).toBe(true);
  });
  it('requires templates after 24 hours or with no inbound message', () => {
    expect(canSendFreeform(new Date('2026-10-14T11:00:00Z'), now)).toBe(false);
    expect(canSendFreeform(null, now)).toBe(false);
  });
});
