import { createHash } from 'node:crypto';

/**
 * Redaction (pipeline stage 1). Nothing that identifies a child or guardian reaches a model
 * provider (CLAUDE.md §7).
 *
 * - Known names (the centre's children and guardians) become stable tokens like ⟦CHILD_3fa2⟧.
 *   Tokens are derived from the centre id and the name, so the same child gets the same token
 *   in every message — history stays consistent and can be re-identified at render time.
 * - Phone numbers, email addresses and SA ID numbers are masked irreversibly. Wes never needs
 *   them, so they are never restored and never stored.
 */
export interface KnownNames {
  children: string[];
  guardians: string[];
}

export interface Redaction {
  text: string;
  /** Token → original value, for restoring the reply. Never leaves the server. */
  vault: Record<string, string>;
  /** Counts for logging and evals (no values). */
  masked: { names: number; phones: number; emails: number; idNumbers: number };
}

const PHONE = /(?:\+27|\b0)[\s-]?[6-8]\d(?:[\s-]?\d){7}\b/g;
const EMAIL = /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g;
const SA_ID = /\b\d{13}\b/g;

function tokenFor(centreId: string, kind: 'CHILD' | 'PERSON', name: string): string {
  const h = createHash('sha256').update(`${centreId}:${kind}:${name.toLowerCase()}`).digest('hex');
  return `⟦${kind}_${h.slice(0, 4)}⟧`;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Whole-word, case-insensitive match that works for names like "Chanté" and "Iminathi". */
function nameRegex(name: string): RegExp {
  return new RegExp(`(?<![\\p{L}\\p{M}])${escapeRegex(name)}(?![\\p{L}\\p{M}])`, 'giu');
}

export function createRedactor(centreId: string, known: KnownNames) {
  // Longest first so "Nomsa Grace" wins over "Nomsa".
  const entries = [
    ...known.children.map((n) => ({
      name: n.trim(),
      token: tokenFor(centreId, 'CHILD', n.trim()),
    })),
    ...known.guardians.map((n) => ({
      name: n.trim(),
      token: tokenFor(centreId, 'PERSON', n.trim()),
    })),
  ]
    .filter((e) => e.name.length >= 2)
    .sort((a, b) => b.name.length - a.name.length);

  return {
    redact(input: string): Redaction {
      const vault: Record<string, string> = {};
      const masked = { names: 0, phones: 0, emails: 0, idNumbers: 0 };
      let text = input
        .replace(EMAIL, () => {
          masked.emails += 1;
          return '[email removed]';
        })
        .replace(SA_ID, () => {
          masked.idNumbers += 1;
          return '[ID number removed]';
        })
        .replace(PHONE, () => {
          masked.phones += 1;
          return '[phone number removed]';
        });
      for (const { name, token } of entries) {
        text = text.replace(nameRegex(name), (match) => {
          masked.names += 1;
          vault[token] = match;
          return token;
        });
      }
      return { text, vault, masked };
    },

    /** Vault of every known name, for re-identifying stored history at render time. */
    fullVault(): Record<string, string> {
      return Object.fromEntries(entries.map((e) => [e.token, e.name]));
    },
  };
}

export function restore(text: string, vault: Record<string, string>): string {
  return text.replace(/⟦(?:CHILD|PERSON)_[0-9a-f]{4}⟧/g, (t) => vault[t] ?? 'the child');
}

/**
 * Restores tokens in a stream of text deltas. A token split across two deltas is held back
 * until it is complete, so the user never sees "⟦CHI".
 */
export function createStreamingRestorer(vault: Record<string, string>) {
  let pending = '';
  return {
    push(delta: string): string {
      pending += delta;
      const open = pending.lastIndexOf('⟦');
      const close = pending.lastIndexOf('⟧');
      let emit: string;
      if (open > close) {
        emit = pending.slice(0, open);
        pending = pending.slice(open);
        if (pending.length > 16) {
          // Not a token after all.
          emit += pending;
          pending = '';
        }
      } else {
        emit = pending;
        pending = '';
      }
      return restore(emit, vault);
    },
    flush(): string {
      const out = restore(pending, vault);
      pending = '';
      return out;
    },
  };
}
