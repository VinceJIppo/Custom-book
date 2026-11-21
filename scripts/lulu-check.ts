/**
 * Checks the Lulu connection and, optionally, validates a book's print files.
 *
 *   npm run lulu:check                 sign in + cover size for each product
 *   npm run lulu:check -- <exportId>   also run Lulu file validation on that export
 *   npm run lulu:check -- --quote 10001 NY [pages]
 *                                      real prices for every shipping speed to a US ZIP code
 *   npm run lulu:check -- --webhook https://<your-public-address>
 *                                      subscribe Lulu's status webhooks to /api/webhooks/print/lulu
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

  const args = process.argv.slice(2);
  if (args[0] === "--quote") {
    const { priceQuote, SHIPPING_LABELS, formatMoney } = await import("../lib/orders/pricing");
    const [zip = "10001", state = "NY", pagesArg = "32"] = args.slice(1);
    const pages = Number(pagesArg);
    const address = { name: "Test Parent", street1: "1 Main St", city: "Anytown", stateCode: state, postcode: zip, countryCode: "US", phone: "555-555-0100" };
    for (const product of catalogAsProducts("lulu")) {
      console.log(`\n${product.label} (${product.sku}), ${pages} pages, to ${zip} ${state}:`);
      for (const opt of await lulu.shippingOptions(product, pages, address)) {
        const q = await lulu.quote(product, pages, address, opt.level);
        const p = priceQuote(q, { marginPercent: c.ORDER_MARGIN_PERCENT, marginFlatUsd: c.ORDER_MARGIN_FLAT_USD, coverCardFees: c.ORDER_COVER_CARD_FEES });
        const fees = (q.fulfillmentCost + q.fees).toFixed(2);
        const arrives = opt.arrivalMax ? `, arrives by ${opt.arrivalMax}` : "";
        console.log(
          `  ${SHIPPING_LABELS[opt.level].padEnd(24)} printing $${q.printCost.toFixed(2)} + shipping $${q.shippingCost.toFixed(2)} + fulfillment/fees $${fees} (tax $${q.tax.toFixed(2)} incl.) = Lulu $${q.total.toFixed(2)} -> customer pays ${formatMoney(p.totalCents)}${arrives}`,
        );
      }
    }
    return;
  }
  if (args[0] === "--webhook") {
    const base = args[1] ?? c.PUBLIC_BASE_URL;
    if (!base) throw new Error("Give the public address, e.g. npm run lulu:check -- --webhook https://xyz.trycloudflare.com");
    const url = `${base.replace(/\/$/, "")}/api/webhooks/print/lulu`;
    const w = await lulu.subscribeWebhook(url);
    const state = w.is_active ? "active" : "INACTIVE: reactivate it in the Lulu developer portal";
    console.log(`${w.created ? "Subscribed" : "Already subscribed"}: ${w.url} (${w.topics.join(", ")}, ${state})`);
    return;
  }

  const exportId = args[0];
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
