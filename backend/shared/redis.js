const Redis = require("ioredis");
const { env } = require("./env");

class InMemoryRedis {
  constructor() {
    this.store = new Map();
    this.ttls = new Map();
  }

  async get(key) {
    if (this.ttls.has(key) && Date.now() > this.ttls.get(key)) {
      this.store.delete(key);
      this.ttls.delete(key);
      return null;
    }
    return this.store.get(key) || null;
  }

  async set(key, value, ...args) {
    this.store.set(key, String(value));
    if (args[0] && args[0].toUpperCase() === "EX" && typeof args[1] === "number") {
      this.ttls.set(key, Date.now() + args[1] * 1000);
    }
    return "OK";
  }

  async del(key) {
    const existed = this.store.delete(key);
    this.ttls.delete(key);
    return existed ? 1 : 0;
  }

  async incr(key) {
    const current = parseInt(this.store.get(key) || "0", 10);
    const next = current + 1;
    this.store.set(key, String(next));
    return next;
  }

  async expire(key, seconds) {
    if (this.store.has(key)) {
      this.ttls.set(key, Date.now() + seconds * 1000);
      return 1;
    }
    return 0;
  }
}

let redisClient;

if (process.env.NODE_ENV === "test" && !process.env.USE_REAL_REDIS) {
  redisClient = new InMemoryRedis();
} else {
  try {
    redisClient = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      retryStrategy(times) {
        if (times > 3) {
          console.warn(
            "[REDIS] Could not connect to Redis; falling back to in-memory store for development."
          );
          return null;
        }
        return Math.min(times * 100, 2000);
      },
    });

    redisClient.on("error", (err) => {
      // Avoid crashing when Redis is optional in development
      if (env.NODE_ENV === "development") {
        console.warn(`[REDIS] Connection error: ${err.message}. Using in-memory fallback.`);
        redisClient = new InMemoryRedis();
      }
    });

    redisClient.connect().catch(() => {
      if (env.NODE_ENV !== "production") {
        redisClient = new InMemoryRedis();
      }
    });
  } catch (err) {
    console.warn("[REDIS] Initialization error, using in-memory store:", err.message);
    redisClient = new InMemoryRedis();
  }
}

module.exports = {
  getRedisClient: () => redisClient,
  InMemoryRedis,
};
