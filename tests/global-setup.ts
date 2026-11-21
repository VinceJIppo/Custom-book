import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

/**
 * Brings the test database up to the current schema. Each test clears the tables it uses.
 * - Default: SQLite (prisma/.data/test.db), via a non-destructive db push.
 * - `npm run test:postgres` (TEST_DATABASE_URL set): applies the production
 *   migrations to an empty Postgres database, exactly as a deploy would.
 */
export default function setup() {
  fs.rmSync(path.join(process.cwd(), ".data", "test-storage"), { recursive: true, force: true });
  const pg = process.env.TEST_DATABASE_URL;
  if (pg) {
    execSync("npx prisma migrate deploy --schema prisma/postgres/schema.prisma", { env: { ...process.env, DATABASE_URL: pg }, stdio: "pipe" });
    return;
  }
  execSync("npx prisma db push --skip-generate", { env: { ...process.env, DATABASE_URL: "file:./.data/test.db" }, stdio: "pipe" });
}
