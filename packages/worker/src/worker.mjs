import fs from 'node:fs/promises';
import path from 'node:path';
import { validateGeneratedProject } from './validator.mjs';

const REDIS_HOST = process.env.REDIS_HOST || 'redis';
const POSTGRES_HOST = process.env.POSTGRES_HOST || 'postgres';
const HEARTBEAT_INTERVAL_MS = 5000;

async function runValidationCli(args) {
  const projectDir = args[0] || process.env.ST2STACK_PROJECT_DIR;
  const reportPath = args[1] || process.env.ST2STACK_VALIDATION_REPORT;

  if (!projectDir) {
    console.error('Usage: node src/worker.mjs validate <project-dir> [report-path]');
    process.exit(1);
  }

  const report = await validateGeneratedProject({ projectDir });
  if (reportPath) {
    await fs.mkdir(path.dirname(reportPath), { recursive: true });
    await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  }

  console.log(JSON.stringify(report, null, 2));
  process.exit(report.success ? 0 : 2);
}

async function runWorkerHeartbeat() {
  const Redis = (await import('ioredis')).default;
  const redis = new Redis({ host: REDIS_HOST, port: 6379, maxRetriesPerRequest: null });

  redis.on('connect', () => {
    console.log('worker: connected to Redis');
  });
  redis.on('error', (err) => {
    console.error('worker: redis error', err.message);
  });

  let tick = 0;
  const heartbeat = () => {
    tick += 1;
    console.log(`worker heartbeat: postgres=${POSTGRES_HOST} redis=${REDIS_HOST} tick=${tick}`);
  };

  heartbeat();
  const interval = setInterval(heartbeat, HEARTBEAT_INTERVAL_MS);

  const shutdown = () => {
    clearInterval(interval);
    redis.quit().then(() => process.exit(0)).catch(() => process.exit(1));
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

async function main() {
  const [, , command, ...args] = process.argv;

  if (command === 'validate') {
    await runValidationCli(args);
    return;
  }

  await runWorkerHeartbeat();
}

main().catch((err) => {
  console.error('worker: fatal', err);
  process.exit(1);
});
