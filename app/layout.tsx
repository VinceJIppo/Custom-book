import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "@fontsource/andika/400.css";
import "@fontsource/andika/400-italic.css";
import "@fontsource/andika/700.css";
import "@fontsource/fredoka/500.css";
import "@fontsource/fredoka/600.css";
import "@fontsource/fraunces/400.css";
import "@fontsource/fraunces/500.css";
import "@fontsource/fraunces/600.css";
import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/600.css";
import "@fontsource/dm-sans/700.css";
import "./globals.css";
import { authMode, getOptionalUser } from "@/lib/auth";
import { signOutAction } from "./signin/actions";

export const metadata: Metadata = {
  title: "StoryStar",
  description: "Personalized picture books where your child is the hero.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getOptionalUser();
  const signIn = authMode() === "email";
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col font-sans text-[15px] antialiased">
        <div className="bg-coral px-4 py-2 text-center text-xs font-medium tracking-wide text-white">
          Personalized picture books where your child is the hero
        </div>
        <header className="bg-white">
          <nav className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-8 gap-y-2 px-5 py-5">
            <Link href="/" className="font-display text-[1.7rem] font-medium leading-none tracking-tight" aria-label="StoryStar home">
              <span className="text-coral">Story</span>
              <span className="mx-0.5 text-sun">★</span>
              <span className="text-cobalt">Star</span>
            </Link>
            {user ? (
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[0.72rem] font-semibold uppercase tracking-[0.12em] text-cobalt">
                <Link href="/" className="hover:text-coral">
                  My books
                </Link>
                <Link href="/themes" className="hover:text-coral">
                  Themes
                </Link>
                <Link href="/orders" className="hover:text-coral">
                  Orders
                </Link>
                <Link href="/children/new" className="hover:text-coral">
                  Add a child
                </Link>
                {signIn && (
                  <form action={signOutAction} className="flex items-center gap-3">
                    <span className="hidden normal-case tracking-normal text-[color:var(--muted)] sm:inline" data-testid="signed-in-as">
                      {user.email}
                    </span>
                    <button className="uppercase hover:text-coral" data-testid="sign-out">
                      Sign out
                    </button>
                  </form>
                )}
              </div>
            ) : (
              signIn && (
                <Link href="/signin" className="text-[0.72rem] font-semibold uppercase tracking-[0.12em] text-cobalt hover:text-coral">
                  Sign in
                </Link>
              )
            )}
          </nav>
          <div className="stripe-band" aria-hidden />
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-8 sm:py-12">{children}</main>
        <footer className="mt-12 bg-sky">
          <div className="mx-auto flex max-w-6xl flex-col gap-2 px-5 py-8 text-sm text-navy sm:flex-row sm:items-center sm:justify-between">
            <span className="font-display text-lg">
              <span className="text-coral">Story</span>
              <span className="mx-0.5 text-sun">★</span>
              <span className="text-cobalt">Star</span>
            </span>
            <span className="eyebrow text-navy/70">Made for little readers and the grown-ups who love them</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
