import type { PrintProvider, ProductSpec, ShippingAddress } from "./types";

/**
 * Chooses which print provider fulfils an order. With one provider it always
 * returns that one; rules by product, destination country or price slot in
 * here later without touching app code.
 */
export class PrintRouter {
  constructor(private readonly providers: PrintProvider[]) {
    if (!providers.length) throw new Error("PrintRouter needs at least one provider");
  }

  async productsFor(productId: string): Promise<Array<{ provider: PrintProvider; product: ProductSpec }>> {
    const out: Array<{ provider: PrintProvider; product: ProductSpec }> = [];
    for (const provider of this.providers) {
      const product = (await provider.getProducts()).find((p) => p.id === productId);
      if (product) out.push({ provider, product });
    }
    return out;
  }

  async allProducts(): Promise<ProductSpec[]> {
    const out: ProductSpec[] = [];
    for (const p of this.providers) out.push(...(await p.getProducts()));
    return out;
  }

  async choose(productId: string, _destination?: Pick<ShippingAddress, "countryCode">) {
    const candidates = await this.productsFor(productId);
    if (!candidates.length) throw new Error(`No print provider offers product ${productId}`);
    return candidates[0];
  }

  /** The provider that fulfils an existing order (by its stored provider name). */
  provider(name: string): PrintProvider {
    const p = this.providers.find((x) => x.name === name);
    if (!p) throw new Error(`Print provider "${name}" is not configured; this order was placed with it.`);
    return p;
  }

  /** Default product for a trim size, used for page-count rules in previews. */
  async defaultProduct(trimSize: string, binding: "hardcover" | "softcover" = "hardcover"): Promise<ProductSpec> {
    for (const provider of this.providers) {
      const p = (await provider.getProducts()).find((x) => x.trimSize === trimSize && x.binding === binding);
      if (p) return p;
    }
    throw new Error(`No product for trim ${trimSize}`);
  }
}
