import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());

async function main() {
  const { db } = await import("../lib/db");
  const { syncBuiltInThemes } = await import("../lib/themes");
  const { getConfig } = await import("../lib/config");
  const email = getConfig().SINGLE_USER_EMAIL;
  await db.user.upsert({ where: { email }, update: {}, create: { email, name: "Parent" } });
  await syncBuiltInThemes(true);
  const themes = await db.theme.count({ where: { isBuiltIn: true } });
  console.log(`Seeded user ${email} and ${themes} built-in themes.`);
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
