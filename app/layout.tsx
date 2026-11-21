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
import "@fontsource/eb-garamond/400.css";
import "@fontsource/eb-garamond/400-italic.css";
import "@fontsource/eb-garamond/500.css";
import "@fontsource/newsreader/400.css";
import "@fontsource/newsreader/400-italic.css";
import "@fontsource/newsreader/500.css";
import "@fontsource/figtree/400.css";
import "@fontsource/figtree/500.css";
import "@fontsource/figtree/600.css";
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
        <div className="bg-bluebell px-4 py-2 text-center text-[13px] font-medium text-navy">
          Personalized picture books where your child is the hero.{" "}
          {user && (
            <Link href="/orders" className="underline underline-offset-2">
              Order a printed copy &rarr;
            </Link>
          )}
        </div>
        <header className="bg-white">
          <div className="mx-auto grid max-w-6xl grid-cols-[1fr_auto_1fr] items-center gap-4 px-5 pt-5 sm:px-10">
            <div className="hidden items-center gap-6 text-sm text-[color:var(--muted)] sm:flex">
              {user && (
                <>
                  <Link href="/themes" className="hover:text-navy">
                    Themes
                  </Link>
                </>
              )}
            </div>
            <Link href="/" className="col-start-2 text-center font-display text-[2rem] leading-none text-navy" aria-label="StoryStar home">
              storystar<span className="ml-0.5 align-super text-[0.9rem] text-pink">★</span>
            </Link>
            <div className="flex items-center justify-end gap-4 text-sm text-[color:var(--muted)]">
              {user && signIn && (
                <form action={signOutAction} className="flex items-center gap-3">
                  <span className="hidden lg:inline" data-testid="signed-in-as">
                    {user.email}
                  </span>
                  <button className="hover:text-navy" data-testid="sign-out">
                    Sign out
                  </button>
                </form>
              )}
              {!user && signIn && (
                <Link href="/signin" className="hover:text-navy">
                  Sign in
                </Link>
              )}
            </div>
          </div>
          {user && (
            <nav className="mx-auto flex max-w-6xl flex-wrap justify-center gap-x-8 gap-y-2 px-5 pb-4 pt-4 text-[15px] text-navy">
              <Link href="/" className="hover:text-cobalt">
                My books
              </Link>
              <Link href="/children/new" className="hover:text-cobalt">
                Add a child
              </Link>
              <Link href="/people/new" className="hover:text-cobalt">
                Add a grown-up
              </Link>
              <Link href="/themes" className="hover:text-cobalt sm:hidden">
                Themes
              </Link>
              <Link href="/orders" className="text-coral hover:text-navy">
                Orders
              </Link>
            </nav>
          )}
          {!user && <div className="pb-4" />}
          <div className="stripe-band" aria-hidden />
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-8 sm:px-10 sm:py-12">{children}</main>
        <footer className="mt-16">
          <div className="bg-sky">
            <div className="mx-auto grid max-w-6xl gap-8 px-5 py-10 text-sm text-navy sm:grid-cols-3 sm:px-10">
              <div>
                <p className="font-display text-2xl">
                  storystar<span className="ml-0.5 align-super text-sm text-pink">★</span>
                </p>
                <p className="mt-2 text-[color:var(--muted)]">Made for little readers and the grown-ups who love them.</p>
              </div>
              <div className="space-y-2">
                <p className="font-display text-lg">Make a book</p>
                <Link href="/children/new" className="block hover:underline">
                  Add a child
                </Link>
                <Link href="/people/new" className="block hover:underline">
                  Add a grown-up
                </Link>
                <Link href="/themes" className="block hover:underline">
                  Themes
                </Link>
              </div>
              <div className="space-y-2">
                <p className="font-display text-lg">Your orders</p>
                <Link href="/orders" className="block hover:underline">
                  Order history
                </Link>
                <p className="text-[color:var(--muted)]">Printed and shipped to any address, gift-ready.</p>
              </div>
            </div>
          </div>
          <div className="bg-navy">
            <div className="mx-auto max-w-6xl px-5 py-4 text-xs text-white/80 sm:px-10">&copy; {new Date().getFullYear()} StoryStar</div>
          </div>
        </footer>
      </body>
    </html>
  );
}
