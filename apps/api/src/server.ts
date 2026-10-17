import { buildApp } from './app';
import { loadConfig } from './config';
import { createDeps } from './deps';

const config = loadConfig();
const { deps, close } = await createDeps(config, (msg) => console.info(msg));
const app = await buildApp({ deps });

const shutdown = async (signal: string) => {
  app.log.info({ signal }, 'shutting down');
  await app.close();
  await close();
  process.exit(0);
};
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

await app.listen({ port: config.API_PORT, host: '0.0.0.0' });
