import { getOptionalUser } from "@/lib/auth";
import { Landing } from "@/components/Landing";

export const dynamic = "force-dynamic";
export const metadata = { title: "StoryStar: personalized picture books" };

/** The public home page: what StoryStar makes, with example pages. */
export default async function ExamplesPage() {
  const user = await getOptionalUser();
  return <Landing signedIn={!!user} startHref={user ? "/" : "/signin"} />;
}
