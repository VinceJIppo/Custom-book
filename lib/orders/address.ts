import { z } from "zod";
import type { ShippingAddress } from "../providers/print/types";

/** Countries where the printer needs a state or province code (from Lulu's API docs). */
export const STATE_REQUIRED = new Set([
  "AE", "AS", "AU", "BR", "CA", "CN", "CO", "CR", "KY", "ES", "FM", "HK", "HN", "ID", "IN", "IQ", "IT", "JM", "JP", "KN",
  "KR", "MX", "MH", "MP", "NR", "PW", "PG", "PF", "RU", "SV", "SO", "TW", "UM", "US", "VE", "VI",
]);
/** Places that don't use postcodes. */
const NO_POSTCODE = new Set(["AE", "HK", "QA", "BS", "IE"]);
const PHONE = /^\+?[\d\s\-./()]{8,20}$/;

const optional = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, message)
    .optional()
    .transform((v) => v || undefined);

/** Shipping address, with the printer's field limits (Lulu: name 35, street and city 30 characters). */
export const AddressSchema = z
  .object({
    name: z.string().trim().min(2, "Enter the recipient's full name.").max(35, "The name can be at most 35 characters."),
    street1: z.string().trim().min(3, "Enter the street address.").max(30, "Street address line 1 can be at most 30 characters; continue on line 2."),
    street2: optional(30, "Street address line 2 can be at most 30 characters."),
    city: z.string().trim().min(2, "Enter the city.").max(30, "The city can be at most 30 characters."),
    stateCode: z
      .string()
      .trim()
      .max(3, "Use the 2 or 3 letter state or province code (for example CA or NSW).")
      .optional()
      .transform((v) => v?.toUpperCase() || undefined),
    postcode: z.string().trim().max(64).default(""),
    countryCode: z
      .string()
      .trim()
      .length(2, "Choose a country.")
      .transform((v) => v.toUpperCase()),
    phone: z.string().trim().regex(PHONE, "Enter a phone number for the delivery driver (8 to 20 digits, + allowed)."),
    email: z
      .string()
      .trim()
      .email("Enter a valid email or leave it empty.")
      .optional()
      .or(z.literal("").transform(() => undefined)),
  })
  .superRefine((a, ctx) => {
    if (STATE_REQUIRED.has(a.countryCode) && !a.stateCode) ctx.addIssue({ code: "custom", path: ["stateCode"], message: "Enter the state or province code (for example CA)." });
    if (a.countryCode === "US" && a.stateCode && !/^[A-Z]{2}$/.test(a.stateCode)) ctx.addIssue({ code: "custom", path: ["stateCode"], message: "Use the 2-letter state code (for example NY)." });
    if (!NO_POSTCODE.has(a.countryCode) && !a.postcode) ctx.addIssue({ code: "custom", path: ["postcode"], message: "Enter the postcode or ZIP code." });
    if (a.countryCode === "US" && a.postcode && !/^\d{5}(-\d{4})?$/.test(a.postcode)) ctx.addIssue({ code: "custom", path: ["postcode"], message: "Use a 5-digit ZIP code (or ZIP+4)." });
  });

export type AddressInput = z.input<typeof AddressSchema>;

export function parseAddress(input: unknown): { ok: true; address: ShippingAddress } | { ok: false; errors: Record<string, string> } {
  const r = AddressSchema.safeParse(input);
  if (r.success) return { ok: true, address: r.data };
  const errors: Record<string, string> = {};
  for (const issue of r.error.issues) {
    const key = String(issue.path[0] ?? "form");
    errors[key] ??= issue.message;
  }
  return { ok: false, errors };
}

export const GiftNoteSchema = z
  .string()
  .trim()
  .max(500, "Keep the gift note under 500 characters.")
  .optional()
  .transform((v) => v || undefined);

/** Countries offered in the form (the printer ships to more; add here as needed). */
export const COUNTRIES: Array<[string, string]> = [
  ["US", "United States"],
  ["CA", "Canada"],
  ["GB", "United Kingdom"],
  ["IE", "Ireland"],
  ["AU", "Australia"],
  ["NZ", "New Zealand"],
  ["DE", "Germany"],
  ["FR", "France"],
  ["ES", "Spain"],
  ["IT", "Italy"],
  ["NL", "Netherlands"],
  ["SE", "Sweden"],
  ["MX", "Mexico"],
];
