import Redis from "ioredis";
import { env } from "./env";

const redisOptions = {
  retryStrategy: (times: number) => Math.min(times * 100, 3000),
  maxRetriesPerRequest: 3,
  tls: {},  
};

export const redis      = new Redis(env.redisUrl, redisOptions);
export const publisher  = new Redis(env.redisUrl, redisOptions);
export const subscriber = new Redis(env.redisUrl, redisOptions);

redis.on("error",      (err) => console.error("[Redis] Error:", err.message));
publisher.on("error",  (err) => console.error("[Publisher] Error:", err.message));
subscriber.on("error", (err) => console.error("[Subscriber] Error:", err.message));

redis.on("connect",      () => console.log("[Redis] Connected to Render Redis"));
publisher.on("connect",  () => console.log("[Publisher] Connected"));
subscriber.on("connect", () => console.log("[Subscriber] Connected"));