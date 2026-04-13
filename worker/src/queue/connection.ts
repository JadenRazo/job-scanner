import IORedis, { type Redis } from "ioredis";
import { config } from "../config.js";

// BullMQ requires maxRetriesPerRequest=null and enableReadyCheck=false on the
// connection used by workers.
export const connection: Redis = new IORedis(config.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});
