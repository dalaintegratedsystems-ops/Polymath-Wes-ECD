import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { createDatabase } from '../client';
import { MIGRATIONS_FOLDER } from '../index';

const url = process.env.DATABASE_OWNER_URL;
if (!url) throw new Error('DATABASE_OWNER_URL is required (migrations run as the owner role)');

const { db, close } = createDatabase(url, { max: 1 });
await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
await close();
console.info('Migrations applied.');
