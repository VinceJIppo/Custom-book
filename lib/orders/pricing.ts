import type { PrintQuote, ShippingLevel } from "../providers/print/types";

export interface PricingConfig {
  marginPercent: number;
  marginFlatUsd: number;
  coverCardFees: boolean;
}

/** Stripe's standard card fee for US cards (used only to cover it in the price). */
export const CARD_FEE_PERCENT = 2.9;
export const CARD_FEE_FIXED_CENTS = 30;

/**
 * What the customer pays, with the internal breakdown. The customer only ever
 * sees `totalCents`; the rest is stored on the order for you.
 */
export interface CustomerQuote {
  currency: string;
  shippingLevel: ShippingLevel;
  /** The printer's full charge to you (print, shipping, fulfillment, fees, tax). */
  printer: PrintQuote;
  margin: number;
  cardFees: number;
  totalCents: number;
  arrivalMin?: string;
  arrivalMax?: string;
  quotedAt: string;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function priceQuote(printer: PrintQuote, cfg: PricingConfig, arrival: { min?: string; max?: string } = {}): CustomerQuote {
  const cost = printer.total;
  const margin = round2((cost * cfg.marginPercent) / 100 + cfg.marginFlatUsd);
  const subtotalCents = Math.round((cost + margin) * 100);
  // Gross up so that after the card fee, what's left still covers cost + margin.
  const totalCents = cfg.coverCardFees ? Math.ceil((subtotalCents + CARD_FEE_FIXED_CENTS) / (1 - CARD_FEE_PERCENT / 100)) : subtotalCents;
  return {
    currency: printer.currency,
    shippingLevel: printer.shippingLevel,
    printer,
    margin,
    cardFees: round2((totalCents - subtotalCents) / 100),
    totalCents,
    arrivalMin: arrival.min,
    arrivalMax: arrival.max,
    quotedAt: new Date().toISOString(),
  };
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
