import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "@fontsource/andika/400.css";
import "@fontsource/andika/700.css";
import "@fontsource/fredoka/500.css";
import "@fontsource/fredoka/600.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "StoryStar",
  description: "Personalized picture books where your child is the hero.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans antialiased">
        <header className="border-b border-[color:var(--line)] bg-white/80 backdrop-blur">
          <nav className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
            <Link href="/" className="font-display text-xl font-semibold text-berry">
              ★ StoryStar
            </Link>
            <div className="flex gap-4 text-sm font-semibold">
              <Link href="/" className="hover:text-berry">
                My books
              </Link>
              <Link href="/children/new" className="hover:text-berry">
                Add a child
              </Link>
            </div>
          </nav>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-6 sm:py-10">{children}</main>
      </body>
    </html>
  );
}
