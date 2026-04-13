import { defineConfig } from "drizzle-kit";

// Only the Better Auth tables are referenced here. Domain tables in
// `schema-readonly.ts` are owned by the raw SQL migrations in /root/job-scanner/db
// and must NOT be managed by drizzle-kit.
export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
