import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Migrations live next to this package's source (`packages/db/migrations`). Bundled apps copy
 * them beside their output (`dist/migrations`), so look in both places.
 */
function resolveMigrations(): string {
  const candidates = [
    process.env.WES_MIGRATIONS_DIR,
    fileURLToPath(new URL('../migrations', import.meta.url)),
    fileURLToPath(new URL('./migrations', import.meta.url)),
  ].filter((p): p is string => Boolean(p));
  return candidates.find((p) => existsSync(`${p}/meta/_journal.json`)) ?? candidates[0]!;
}

export const MIGRATIONS_FOLDER = resolveMigrations();
