const REDIS_HOST = process.env.REDIS_HOST || "redis";
const POSTGRES_HOST = process.env.POSTGRES_HOST || "postgres";
const HEARTBEAT_INTERVAL_MS = 5000;

async function main() {
  const Redis = (await import("ioredis")).default;
  const redis = new Redis({ host: REDIS_HOST, port: 6379, maxRetriesPerRequest: null });

  redis.on("connect", () => {
    console.log("worker: connected to Redis");
  });
  redis.on("error", (err) => {
    console.error("worker: redis error", err.message);
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
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((err) => {
  console.error("worker: fatal", err);
  process.exit(1);
});
