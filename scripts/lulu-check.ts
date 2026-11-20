/**
 * Checks the Lulu connection and, optionally, validates a book's print files.
 *
 *   npm run lulu:check                 sign in + cover size for the default product
 *   npm run lulu:check -- <exportId>   also run Lulu file validation on that export
 *
 * Needs LULU_CLIENT_KEY and LULU_CLIENT_SECRET (sandbox keys from developers.sandbox.lulu.com).
 * File validation needs PUBLIC_BASE_URL: Lulu downloads the PDFs from there.
 */
import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());

async function main() {
  const { getConfig } = await import("../lib/config");
  const { LuluPrintProvider } = await import("../lib/providers/lulu/print");
  const { catalogAsProducts } = await import("../lib/providers/print/mock");
  const c = getConfig();
  if (!c.LULU_CLIENT_KEY || !c.LULU_CLIENT_SECRET) {
    console.error("Set LULU_CLIENT_KEY and LULU_CLIENT_SECRET in .env.local first (sandbox: developers.sandbox.lulu.com > API keys).");
    process.exit(1);
  }
  const lulu = new LuluPrintProvider({ baseUrl: c.LULU_API_BASE, clientKey: c.LULU_CLIENT_KEY, clientSecret: c.LULU_CLIENT_SECRET });
  console.log(`Lulu API: ${c.LULU_API_BASE}`);
  for (const product of catalogAsProducts("lulu")) {
    const dims = await lulu.getCoverDimensions(product, 24);
    console.log(`  ${product.sku}  24 pages -> cover ${dims.widthIn} x ${dims.heightIn} in (spine ${dims.spineIn} in)`);
  }
  console.log("Sign-in and cover dimensions OK.");

  const exportId = process.argv[2];
  if (!exportId) return;
  const { db } = await import("../lib/db");
  const { getStorage } = await import("../lib/storage");
  const exp = await db.bookExport.findUnique({ where: { id: exportId } });
  if (!exp?.interiorKey || !exp.coverKey || !exp.pageCount) throw new Error("Export not found or not ready");
  const product = catalogAsProducts("lulu").find((p) => p.id === exp.productId)!;
  const storage = getStorage();
  const interiorUrl = await storage.signedUrl(exp.interiorKey, c.PRINT_FILE_URL_TTL_SECONDS, { absolute: true });
  const coverUrl = await storage.signedUrl(exp.coverKey, c.PRINT_FILE_URL_TTL_SECONDS, { absolute: true });
  console.log(`Validating with Lulu (files served from ${new URL(interiorUrl).origin}) ...`);
  const result = await lulu.validateFiles({ interiorUrl, coverUrl, product, pageCount: exp.pageCount, onProgress: (m) => console.log(`  ${m}`) });
  console.log(JSON.stringify(result, null, 2));
  await db.$disconnect();
  process.exit(result.ok ? 0 : 2);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
