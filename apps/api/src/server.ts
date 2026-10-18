import { buildApp } from './app';
import { loadConfig } from './config';
import { createDeps } from './deps';
import { sendDueReminders } from './modules/channels/routes';

const config = loadConfig();
const { deps, close } = await createDeps(config, (msg) => console.info(msg));
const app = await buildApp({ deps });

// Reminders over WhatsApp, every 15 minutes (claims are atomic across replicas).
const REMINDER_INTERVAL_MS = 15 * 60_000;
const reminders = deps.whatsapp
  ? setInterval(() => {
      sendDueReminders(deps, config)
        .then((n) => n > 0 && app.log.info({ sent: n }, 'reminders sent'))
        .catch((err: unknown) => app.log.error({ err }, 'reminders failed'));
    }, REMINDER_INTERVAL_MS)
  : null;

const shutdown = async (signal: string) => {
  app.log.info({ signal }, 'shutting down');
  if (reminders) clearInterval(reminders);
  await app.close();
  await close();
  process.exit(0);
};
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

await app.listen({ port: config.API_PORT, host: '0.0.0.0' });
