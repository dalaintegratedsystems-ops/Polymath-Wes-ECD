import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * House style: no em or en dashes in anything people read (screens, stories, agent replies).
 * Hyphens inside words are fine. Code comments are ignored.
 */
const ROOT = resolve(__dirname, '../../..');
const DIRS = [
  'packages/ui/src',
  'apps/web/app',
  'apps/web/components',
  'apps/web/lib',
  'packages/agent/src',
  'packages/shared/src/i18n',
];
const DASH = /[–—]/;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.(tsx?|json)$/.test(name) ? [path] : [];
  });
}

/** Drop block and line comments so only code and copy remain. */
function withoutComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ''))
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '');
}

describe('copy style', () => {
  it('uses no em or en dashes in user-facing text', () => {
    const offenders: string[] = [];
    for (const dir of DIRS) {
      for (const file of files(join(ROOT, dir))) {
        withoutComments(readFileSync(file, 'utf8'))
          .split('\n')
          .forEach((line, i) => {
            if (DASH.test(line)) offenders.push(`${relative(ROOT, file)}:${i + 1}: ${line.trim()}`);
          });
      }
    }
    expect(offenders).toEqual([]);
  });
});
