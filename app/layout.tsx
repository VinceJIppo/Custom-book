import { getCredits } from "@/lib/credits";
import type { Metadata, Viewport } from "next";
import "@fontsource/andika/400.css";
import "@fontsource/andika/400-italic.css";
import "@fontsource/andika/700.css";
import "@fontsource/fredoka/500.css";
import "@fontsource/fredoka/600.css";
import "@fontsource/fraunces/400.css";
import "@fontsource/fraunces/500.css";
import "@fontsource/fraunces/600.css";
import "@fontsource/eb-garamond/400.css";
import "@fontsource/eb-garamond/400-italic.css";
import "@fontsource/cormorant-garamond/500.css";
import "@fontsource/cormorant-garamond/500-italic.css";
import "@fontsource/eb-garamond/500.css";
import "./globals.css";
import { StarSymbol } from "@/components/brand/Star";
import { SiteHeader } from "@/components/brand/SiteHeader";
import { SiteFooter } from "@/components/brand/SiteFooter";
import { THEME_SCRIPT } from "@/components/brand/theme";
import { authMode, getOptionalUser } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin";
import { signOutAction } from "./signin/actions";

export const metadata: Metadata = {
  title: "StoryStar",
  description: "Personalized picture books where your child is the hero.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getOptionalUser();
  const credits = user ? await getCredits(user.id).catch(() => null) : null;
  const signIn = authMode() === "email";
  // Parents don't pick themes any more (one house theme); the Themes pages stay for admins.
  const admin = !!user && isAdminEmail(user.email);
  return (
    // data-theme is set before first paint by the script below (Daytime is the CSS default without it).
    // It is left out of the markup so React never writes it back; the header restores it if React redraws <html>.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="flex min-h-screen flex-col bg-paper font-sans text-ink antialiased">
        <StarSymbol />
        <SiteHeader
          links={
            user
              ? [
                  { href: "/", label: "My books" },
                  { href: "/children/new", label: "Add a child" },
                  { href: "/orders", label: "Orders" },
                  ...(admin ? [{ href: "/themes", label: "Themes" }] : []),
                ]
              : [
                  { href: "/#how", label: "How it works" },
                  { href: "/#stories", label: "Stories" },
                  { href: "/examples", label: "Peek inside" },
                ]
          }
          credits={credits?.enabled ? credits.balanceUsd : null}
          signOut={user && signIn ? signOutAction : undefined}
          signInHref={!user && signIn ? "/signin" : undefined}
          email={user?.email}
          showCta={!user}
        />
        <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-8 sm:px-10 sm:py-12">{children}</main>
        <SiteFooter signedIn={!!user} />
      </body>
    </html>
  );
}
