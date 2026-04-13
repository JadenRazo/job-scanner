import { Queue } from "bullmq";
import { connection } from "./connection.js";

export const QUEUE_NAMES = {
  scrape: "scrape",
  matchCheap: "match-cheap",
  matchDeep: "match-deep",
  renderLetter: "render-letter",
  notify: "notify",
  artifactManagers: "artifact-managers",
  artifactTailor: "artifact-tailor",
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

// Scraping is cheap and HTTP-flaky, so auto-retry is fine.
const scrapeJobOptions = {
  attempts: 3,
  backoff: { type: "exponential" as const, delay: 10_000 },
  removeOnComplete: { age: 3600, count: 1000 },
  removeOnFail: { age: 24 * 3600 },
};

// LLM jobs are expensive — a failed call already consumed quota, retrying
// just burns more. One shot per enqueue; the next scheduled tick reprocesses
// whatever didn't land.
const llmJobOptions = {
  attempts: 1,
  removeOnComplete: { age: 3600, count: 1000 },
  removeOnFail: { age: 24 * 3600 },
};

// Discord webhook calls are idempotent-ish but cheap; allow a couple of
// retries for transient 5xx / network blips.
const notifyJobOptions = {
  attempts: 3,
  backoff: { type: "exponential" as const, delay: 5_000 },
  removeOnComplete: { age: 3600, count: 1000 },
  removeOnFail: { age: 24 * 3600 },
};

export const scrapeQueue = new Queue(QUEUE_NAMES.scrape, {
  connection,
  defaultJobOptions: scrapeJobOptions,
});
export const matchCheapQueue = new Queue(QUEUE_NAMES.matchCheap, {
  connection,
  defaultJobOptions: llmJobOptions,
});
export const matchDeepQueue = new Queue(QUEUE_NAMES.matchDeep, {
  connection,
  defaultJobOptions: llmJobOptions,
});
export const renderLetterQueue = new Queue(QUEUE_NAMES.renderLetter, {
  connection,
  defaultJobOptions: llmJobOptions,
});
export const notifyQueue = new Queue(QUEUE_NAMES.notify, {
  connection,
  defaultJobOptions: notifyJobOptions,
});

export const artifactManagersQueue = new Queue(QUEUE_NAMES.artifactManagers, {
  connection,
  defaultJobOptions: llmJobOptions,
});
export const artifactTailorQueue = new Queue(QUEUE_NAMES.artifactTailor, {
  connection,
  defaultJobOptions: llmJobOptions,
});

export const allQueues = [
  scrapeQueue,
  matchCheapQueue,
  matchDeepQueue,
  renderLetterQueue,
  notifyQueue,
  artifactManagersQueue,
  artifactTailorQueue,
];
