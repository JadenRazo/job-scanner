import { request } from "undici";
import { logger } from "../logger.js";
import { config } from "../config.js";

const log = logger.child({ mod: "discord" });

export interface MatchEmbedInput {
  jobId: number;
  title: string;
  company: string;
  location: string | null;
  url: string;
  score: number;
  rationale: string;
  matched: string[];
  gaps: string[];
}

function colorForScore(score: number): number {
  if (score >= 90) return 0x2ecc71; // green
  if (score >= 80) return 0x3498db; // blue
  if (score >= 70) return 0xf1c40f; // yellow
  return 0x95a5a6; // grey — normally we don't notify below 70
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + "…";
}

function formatList(items: string[]): string {
  if (items.length === 0) return "—";
  return truncate(items.join(" • "), 1000);
}

export async function postMatchEmbed(
  webhookUrl: string,
  m: MatchEmbedInput,
): Promise<void> {
  const dashBase = config.DASHBOARD_BASE_URL?.replace(/\/$/, "") ?? "";
  const dashboardUrl = dashBase ? `${dashBase}/jobs/${m.jobId}` : m.url;

  const embed = {
    title: truncate(`[${m.score}] ${m.title}`, 256),
    url: m.url,
    description: truncate(m.rationale, 2000),
    color: colorForScore(m.score),
    fields: [
      { name: "Company", value: truncate(m.company, 256), inline: true },
      { name: "Location", value: truncate(m.location ?? "unspecified", 256), inline: true },
      { name: "Score", value: `${m.score}/100`, inline: true },
      { name: "Matched", value: formatList(m.matched), inline: false },
      { name: "Gaps", value: formatList(m.gaps), inline: false },
    ],
    footer: { text: truncate(dashboardUrl, 2048) },
    timestamp: new Date().toISOString(),
  };

  const payload = { embeds: [embed] };

  const { statusCode, body } = await request(webhookUrl, {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": config.USER_AGENT },
    body: JSON.stringify(payload),
  });

  if (statusCode >= 300) {
    const text = await body.text();
    throw new Error(`discord webhook ${statusCode}: ${text.slice(0, 200)}`);
  }
  await body.dump();
  log.debug({ jobId: m.jobId, score: m.score }, "discord ping sent");
}
