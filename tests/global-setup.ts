import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

/**
 * Brings the SQLite test database (prisma/.data/test.db) up to the current
 * schema. Non-destructive; each test clears the tables it uses.
 */
export default function setup() {
  const env = { ...process.env, DATABASE_URL: "file:./.data/test.db" };
  fs.rmSync(path.join(process.cwd(), ".data", "test-storage"), { recursive: true, force: true });
  execSync("npx prisma db push --skip-generate", { env, stdio: "pipe" });
}
