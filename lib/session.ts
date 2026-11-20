import { redirect } from "next/navigation";
import { getCurrentUser } from "./auth";

/** Current parent, sent to /welcome until they confirm they are an adult. */
export async function requireOnboardedUser() {
  const user = await getCurrentUser();
  if (!user.ageConfirmedAt) redirect("/welcome");
  return user;
}
