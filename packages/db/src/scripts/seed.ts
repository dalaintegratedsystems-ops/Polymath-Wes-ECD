import { createDatabase } from '../client';
import { createFieldCrypto } from '../crypto';
import { seed } from '../seed';

if (process.env.NODE_ENV === 'production') throw new Error('Refusing to seed production');
const url = process.env.DATABASE_OWNER_URL;
if (!url) throw new Error('DATABASE_OWNER_URL is required');

const { db, close } = createDatabase(url, { max: 1 });
const result = await seed(db, createFieldCrypto());
await close();
console.info(
  `Seeded ${result.children} demo children with ${result.attendanceDays} days of attendance.`,
);
