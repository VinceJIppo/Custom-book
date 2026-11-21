/**
 * Runs the test suite against Postgres (production's database) instead of SQLite.
 *   TEST_DATABASE_URL=postgresql://user@localhost:5432/storystar_test npm run test:postgres
 * Applies the production migrations to that (empty) database first, then puts the
 * SQLite client back so local development keeps working.
 */
import { execSync } from "node:child_process";

if (!process.env.TEST_DATABASE_URL) {
  console.error("Set TEST_DATABASE_URL to an empty Postgres database first.");
  process.exit(1);
}
const run = (cmd) => execSync(cmd, { stdio: "inherit" });
let code = 0;
try {
  run("node scripts/prisma-postgres.mjs");
  run("npx prisma generate --schema prisma/postgres/schema.prisma");
  run("npx vitest run");
} catch {
  code = 1;
} finally {
  execSync("npx prisma generate", { stdio: "ignore" });
}
process.exit(code);
