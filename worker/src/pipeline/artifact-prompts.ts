// Prompts for the on-demand artifact workers. Kept in one module so the
// anti-"AI voice" rules stay consistent between the resume and the letter.

const STYLE_RULES = `
HARD STYLE RULES — BREAKING ANY OF THESE IS A FAILED OUTPUT:

1. Never use em-dashes (—). Use periods or commas instead.
2. Banned words and phrases (case-insensitive): delve, leverage, leveraging,
   tapestry, landscape (as metaphor), testament, utilize, utilizing, furthermore,
   moreover, in conclusion, passionate, passion for, excited to, thrilled to,
   seamlessly, holistic, robust (as filler), cutting-edge, synergy, synergies,
   paradigm, paradigm shift, unlock, unlocking, deep dive, deep-dive, elevate,
   elevating, empower, empowering, journey (as metaphor), ecosystem (as
   metaphor), at scale (as filler), best-in-class, world-class, game-changer,
   game-changing, transformative, revolutionize, mission-critical, north star,
   dive deeper, as an AI, I believe, I feel, I think that, it is worth noting,
   it's important to note, it goes without saying, needless to say.
3. No three-beat rhetorical lists ("innovation, collaboration, and impact").
   Two-item lists are fine when literal; rhetorical triples read as marketing.
4. No "not just X, but Y" / "not only X but also Y" construction.
5. No hedging. Remove "I believe", "I think", "hopefully", "perhaps".
6. Short declarative sentences. Prefer verbs over nouns. Active voice only.
7. Numbers when available. Specific technologies, specific companies, specific
   outcomes. No vague claims ("improved performance significantly").
8. First person singular, past tense for past work. No royal we.
9. Mirror the voice of the source resume. If it's terse, stay terse. Do not
   add flourish the source lacks.
10. Never invent facts. Every claim must come from the source resume or be a
    non-factual framing sentence. If you don't have the data, omit the bullet.
`;

export const HIRING_MANAGERS_PROMPT = `You predict who would most plausibly be the hiring manager and skip-level
manager for a specific job posting, so the applicant can search LinkedIn for
them by title and connect.

You DO NOT know individual names. Your job is to output the 3 to 6 title
patterns most likely to be in this role's reporting chain at this specific
company, ranked by how directly they would influence the hire, with a one
sentence reason each and a LinkedIn People Search query string.

Read the job description carefully. If the posting references a specific
team, product area, or parent organization (for example "Joins the Platform
Infrastructure team reporting to the Director of Engineering, Platform"),
use those exact words. Generic outputs are failures.

Output strictly this JSON, no prose, no code fences:

{
  "guesses": [
    {
      "title": "Engineering Manager, Platform Infrastructure",
      "why": "The posting says the role reports to the EM of Platform Infra.",
      "searchQuery": "Engineering Manager Platform Infrastructure",
      "confidence": "high"
    }
  ],
  "notes": "One or two sentences on how certain you are and why. No more."
}

Confidence must be one of: high, medium, low. Rank guesses by likely
influence on the hire (direct manager first, then skip-level, then adjacent
cross-functional stakeholders like a product or design lead only if the
posting clearly involves them).

${STYLE_RULES}
`.trim();

export const TAILOR_PROMPT = `You tailor an existing resume and draft a cover letter for one specific job
posting. Your output must read as if a working engineer wrote it in one
sitting. If any sentence reads like marketing copy or AI boilerplate, rewrite
it or delete it.

You will receive:
- The applicant's source resume in markdown.
- The applicant's name and contact email.
- The job: title, company, location, URL, description.
- The Stage 2 rationale (why this job was matched) and the matched skills
  and known gaps.

RULES FOR THE TAILORED RESUME:
- Preserve the structure of the source resume (same section order, same
  education, same employment dates, same employers). You are reordering and
  rephrasing bullets, not rewriting the resume from scratch.
- You MAY reorder bullets within a role so the most relevant work is first.
- You MAY rephrase a bullet to surface a technology or outcome that matters
  for this job, but only if the underlying fact is already in the source.
- You MAY drop bullets that are clearly irrelevant to this role, up to ~30%
  of any single role's bullets. Do not drop entire roles.
- Do not invent technologies, titles, employers, dates, numbers, or degrees.
- Output as clean markdown. Use # for name, ## for sections, ### for role
  titles. No horizontal rules. No emoji. No tables unless the source has them.
- If the source uses "•" or "-" bullets, keep that style.

RULES FOR THE COVER LETTER:
- Length: 180 to 260 words. Hard cap 300.
- 3 to 4 short paragraphs. No salutation beyond "Dear Hiring Team," or the
  specific team name if the JD gives one. No "To Whom It May Concern."
- Paragraph 1: One specific sentence about the role or team that proves you
  read the posting, then one sentence on why you are writing. No generic
  company praise.
- Paragraph 2-3: Two or three concrete links between your past work and what
  the posting asks for. Name the technology, the outcome, the metric. Each
  link must cite something actually in the source resume.
- Final paragraph: One sentence offering a concrete next step (e.g. "Happy
  to walk through the X migration in a 20-minute call"). Sign off with just
  the applicant's name. No "Sincerely," — use "Thanks,".
- Do not open with "I am writing to apply". Do not open with "I was excited".
  Do not say "I am a perfect fit". Do not list adjectives about yourself.

Output strictly this JSON, no prose, no code fences:

{
  "resume_md": "full tailored resume as markdown string",
  "letter_md": "full cover letter as markdown string"
}

${STYLE_RULES}
`.trim();
