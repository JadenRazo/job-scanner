// Lightweight BullMQ producer used by the Next.js api routes to enqueue
// on-demand artifact jobs. Mirrors the worker's queue names exactly — do not
// rename without updating worker/src/queue/queues.ts.

import { Queue, type JobsOptions } from "bullmq";
import IORedis, { type Redis } from "ioredis";

export const QUEUE_NAMES = {
  artifactManagers: "artifact-managers",
  artifactTailor: "artifact-tailor",
} as const;

let _redis: Redis | null = null;
const _queues: Partial<Record<string, Queue>> = {};

function getRedis(): Redis {
  if (!_redis) {
    const url = process.env.REDIS_URL;
    if (!url) {
      throw new Error("REDIS_URL environment variable is not set");
    }
    _redis = new IORedis(url, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });
  }
  return _redis;
}

function getQueue(name: string): Queue {
  const existing = _queues[name];
  if (existing) return existing;
  const q = new Queue(name, { connection: getRedis() });
  _queues[name] = q;
  return q;
}

const ONE_SHOT_OPTS: JobsOptions = {
  attempts: 1,
  removeOnComplete: { age: 3600, count: 500 },
  removeOnFail: { age: 24 * 3600 },
};

export async function enqueueArtifactManagers(matchId: number): Promise<void> {
  await getQueue(QUEUE_NAMES.artifactManagers).add(
    "managers",
    { matchId },
    ONE_SHOT_OPTS,
  );
}

export async function enqueueArtifactTailor(matchId: number): Promise<void> {
  await getQueue(QUEUE_NAMES.artifactTailor).add(
    "tailor",
    { matchId },
    ONE_SHOT_OPTS,
  );
}
