import { setResumeMd } from "../db/profile.js";
import { pool } from "../db/client.js";

/**
 * Read a resume in markdown (or plain text) from stdin and overwrite
 * profile.resume_md. Used from the host via:
 *
 *   cat resume.md | docker exec -i scanner-worker node dist/cli/set-resume.js
 */
async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function main(): Promise<void> {
  const md = (await readStdin()).trim();
  if (!md) {
    // eslint-disable-next-line no-console
    console.error("set-resume: empty stdin — refusing to clear profile.resume_md");
    process.exit(2);
  }
  await setResumeMd(md);
  // eslint-disable-next-line no-console
  console.log(`profile.resume_md updated (${md.length} chars)`);
  await pool.end();
}

main().then(
  () => process.exit(0),
  (err) => {
    // eslint-disable-next-line no-console
    console.error("set-resume failed:", err);
    process.exit(1);
  },
);
