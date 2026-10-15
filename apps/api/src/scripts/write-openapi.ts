// Writes the OpenAPI document to docs/openapi.json so it can be reviewed in pull requests.
import { writeFile } from 'node:fs/promises';
import { buildApp } from '../app';

const app = await buildApp({ logger: false });
const res = await app.inject({ method: 'GET', url: '/v1/openapi.json' });
await writeFile(
  new URL('../../../../docs/openapi.json', import.meta.url),
  `${JSON.stringify(res.json(), null, 2)}\n`,
);
await app.close();
console.info('Wrote docs/openapi.json');
