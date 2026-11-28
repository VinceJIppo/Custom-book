import { LegalPage } from "@/components/LegalPage";
import { SHIPPING } from "@/lib/legal/shipping";

export const metadata = { title: "Shipping | StoryStar", description: SHIPPING.description };

/** How books are printed to order and shipped by Lulu, with the delivery options and their relative prices. */
export default function ShippingPage() {
  return <LegalPage page={SHIPPING} eyebrow="Shipping" />;
}
