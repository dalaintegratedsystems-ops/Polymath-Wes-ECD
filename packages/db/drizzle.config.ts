import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  out: './migrations',
  dbCredentials: {
    url: process.env.DATABASE_OWNER_URL ?? 'postgres://wes_owner:wes_owner_dev@localhost:5432/wes',
  },
  strict: true,
  verbose: true,
});
