import { config } from './config.js';
import { buildApp } from './app.js';

async function start(): Promise<void> {
  const app = await buildApp(config);

  try {
    await app.listen({ port: config.port, host: '0.0.0.0' });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

void start();
