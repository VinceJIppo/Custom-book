/**
 * Writes prisma/postgres/schema.prisma from prisma/schema.prisma with the
 * Postgres provider. Your computer uses SQLite (no database server needed);
 * production uses Postgres. The models are identical, so there is one source
 * of truth: edit prisma/schema.prisma, then run `npm run db:postgres-schema`
 * (and `npm run db:migration -- <name>` to add a production migration).
 */
import fs from "node:fs";
import path from "node:path";

const src = fs.readFileSync(path.join("prisma", "schema.prisma"), "utf8");
if (!/provider\s*=\s*"sqlite"/.test(src)) throw new Error('prisma/schema.prisma should use provider = "sqlite"');
const out = src
  .replace(/provider\s*=\s*"sqlite"/, 'provider = "postgresql"')
  .replace(/^/, "// GENERATED from prisma/schema.prisma by scripts/prisma-postgres.mjs. Do not edit.\n");
fs.mkdirSync(path.join("prisma", "postgres"), { recursive: true });
const target = path.join("prisma", "postgres", "schema.prisma");
const before = fs.existsSync(target) ? fs.readFileSync(target, "utf8") : "";
fs.writeFileSync(target, out);
console.log(before === out ? `${target} is up to date` : `Wrote ${target}`);
