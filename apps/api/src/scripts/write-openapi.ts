// Writes the OpenAPI document to docs/openapi.json so it can be reviewed in pull requests.
import { createMemoryBlobStore } from '../platform/blob';
import { writeFile } from 'node:fs/promises';
import { createEmbeddedDatabase, createFieldCrypto } from '@wes/db';
import { buildApp } from '../app';
import { createAgentServices } from '../platform/agent';
import { createMemoryOtpSender } from '../platform/deps';

const embedded = await createEmbeddedDatabase();
const app = await buildApp({
  logger: false,
  deps: {
    db: embedded.db,
    crypto: createFieldCrypto(
      Buffer.alloc(32, 1).toString('base64'),
      Buffer.alloc(32, 2).toString('base64'),
    ),
    otpSender: createMemoryOtpSender(),
    blobs: createMemoryBlobStore(),
    agent: createAgentServices({}),
    now: () => new Date(),
  },
});
const res = await app.inject({ method: 'GET', url: '/v1/openapi.json' });
await writeFile(
  new URL('../../../../docs/openapi.json', import.meta.url),
  `${JSON.stringify(res.json(), null, 2)}\n`,
);
await app.close();
await embedded.close();
console.info('Wrote docs/openapi.json');
