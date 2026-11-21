/**
 * Adds a production (Postgres) migration for schema changes made since the last
 * one, without needing a database: it diffs the existing migrations against the
 * current schema.   npm run db:migration -- add_gift_wrap
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const name = (process.argv[2] ?? "").replace(/[^a-z0-9_]/gi, "_").toLowerCase();
if (!name) throw new Error("Give the migration a name: npm run db:migration -- add_gift_wrap");
const dir = path.join("prisma", "postgres", "migrations");
const stamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
// Needs a scratch Postgres to replay the existing migrations into (SHADOW_DATABASE_URL).
const shadow = process.env.SHADOW_DATABASE_URL;
if (!shadow) throw new Error("Set SHADOW_DATABASE_URL to an empty Postgres database (any local one works).");
const sql = execSync(`npx prisma migrate diff --from-migrations ${dir} --to-schema-datamodel prisma/postgres/schema.prisma --shadow-database-url "${shadow}" --script`, { encoding: "utf8" });
if (!sql.trim() || /This is an empty migration/.test(sql)) {
  console.log("No schema changes since the last migration.");
  process.exit(0);
}
const target = path.join(dir, `${stamp}_${name}`);
fs.mkdirSync(target, { recursive: true });
fs.writeFileSync(path.join(target, "migration.sql"), sql);
console.log(`Wrote ${target}/migration.sql`);
