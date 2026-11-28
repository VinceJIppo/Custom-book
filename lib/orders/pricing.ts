import type { PrintQuote, ShippingLevel } from "../providers/print/types";

export interface PricingConfig {
  /** Margin on the printer's charge for the book itself (printing, fulfillment and fees). Never on shipping. */
  marginPercent: number;
  marginFlatUsd: number;
  coverCardFees: boolean;
  /** Added to every order for the account credit the customer gets with it (0 when credits are off). */
  creditChargeUsd?: number;
}

/** Stripe's standard card fee for US cards (used only to cover it in the price). */
export const CARD_FEE_PERCENT = 2.9;
export const CARD_FEE_FIXED_CENTS = 30;

/**
 * What the customer pays, with the internal breakdown stored on the order.
 * Customers see `customerLines` (margin is never shown to them); admins see everything.
 */
export interface CustomerQuote {
  currency: string;
  shippingLevel: ShippingLevel;
  /** The printer's full charge to you (print, shipping, fulfillment, fees, tax). */
  printer: PrintQuote;
  margin: number;
  /** The charge for the account credit that comes with the order (missing on older orders). */
  creditCharge?: number;
  cardFees: number;
  totalCents: number;
  arrivalMin?: string;
  arrivalMax?: string;
  quotedAt: string;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function priceQuote(printer: PrintQuote, cfg: PricingConfig, arrival: { min?: string; max?: string } = {}): CustomerQuote {
  // Shipping is passed through at cost: the margin applies to everything else the printer charges.
  const bookCost = Math.max(0, printer.total - printer.shippingCost);
  const margin = round2((bookCost * cfg.marginPercent) / 100 + cfg.marginFlatUsd);
  const creditCharge = round2(cfg.creditChargeUsd ?? 0);
  const subtotalCents = Math.round((printer.total + margin + creditCharge) * 100);
  // Gross up so that after the card fee, what's left still covers cost + margin + credit.
  const totalCents = cfg.coverCardFees ? Math.ceil((subtotalCents + CARD_FEE_FIXED_CENTS) / (1 - CARD_FEE_PERCENT / 100)) : subtotalCents;
  return {
    currency: printer.currency,
    shippingLevel: printer.shippingLevel,
    printer,
    margin,
    creditCharge,
    cardFees: round2((totalCents - subtotalCents) / 100),
    totalCents,
    arrivalMin: arrival.min,
    arrivalMax: arrival.max,
    quotedAt: new Date().toISOString(),
  };
}

export interface PriceLine {
  key: "book" | "shipping" | "credit";
  label: string;
  cents: number;
}

/**
 * The breakdown customers see. Printing, fulfillment and fees, the card fee allowance and the
 * margin roll up into one "Book" line; shipping and the account credit are their own lines.
 * The lines always add up to the total exactly (the book line takes any rounding).
 */
export function customerLines(quote: Pick<CustomerQuote, "printer" | "creditCharge" | "totalCents">, bookTitle: string): PriceLine[] {
  const shipping = Math.round(quote.printer.shippingCost * 100);
  const credit = Math.round((quote.creditCharge ?? 0) * 100);
  const lines: PriceLine[] = [
    { key: "book", label: `Book: ${bookTitle}`, cents: quote.totalCents - shipping - credit },
    { key: "shipping", label: "Shipping", cents: shipping },
  ];
  if (credit > 0) lines.push({ key: "credit", label: "Account credit", cents: credit });
  return lines;
}

export function formatMoney(cents: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}

export const SHIPPING_LABELS: Record<ShippingLevel, string> = {
  MAIL: "Standard mail",
  PRIORITY_MAIL: "Priority mail",
  GROUND_HD: "Ground (home delivery)",
  GROUND_BUS: "Ground (business)",
  GROUND: "Ground",
  EXPEDITED: "Expedited (2-day)",
  EXPRESS: "Express (overnight)",
};
