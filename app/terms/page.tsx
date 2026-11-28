import { LegalPage } from "@/components/LegalPage";
import { TERMS } from "@/lib/legal/terms";

export const metadata = { title: "Terms | StoryStar", description: TERMS.description };

/** The Terms of service (a draft for legal review: bracketed facts are still to be filled in). */
export default function TermsPage() {
  return <LegalPage page={TERMS} eyebrow="Terms" />;
}
