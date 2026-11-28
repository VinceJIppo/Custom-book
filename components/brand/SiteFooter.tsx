import Link from "next/link";

/** A footer link, or a bracketed placeholder for a page that doesn't exist yet. */
type FooterItem = { href: string; label: string } | { placeholder: string };

function Item({ item }: { item: FooterItem }) {
  if ("placeholder" in item) {
    return (
      <span className="opacity-80" title="Page not written yet">
        [{item.placeholder}]
      </span>
    );
  }
  return <Link href={item.href}>{item.label}</Link>;
}

/**
 * The footer (BRAND.md sections 9 and 10): ceiling color with an upward scallop, the
 * cream wordmark and tagline, and three link columns. Pages that don't exist yet are
 * shown as bracketed placeholders until they're written.
 */
export function SiteFooter({ signedIn }: { signedIn: boolean }) {
  const shop: FooterItem[] = [
    { href: "/books/new", label: "Start a book" },
    { href: "/#stories", label: "Stories" },
    ...(signedIn ? [{ href: "/orders", label: "Your orders" }, { href: "/account", label: "Your account" }] : []),
  ];
  const help: FooterItem[] = [{ href: "/#how", label: "How it works" }, { href: "/examples", label: "Peek inside" }, { placeholder: "Shipping" }, { placeholder: "Contact us" }];
  const about: FooterItem[] = [{ href: "/our-story", label: "Our story" }, { href: "/photo-privacy", label: "Photo privacy" }, { placeholder: "Terms" }];
  return (
    <footer className="ss-footer ss-scallop-top">
      <div className="ss-container ss-footer__inner">
        <div className="ss-footer__brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logos/storystar-wordmark-cream.svg" alt="storystar" width={165} height={44} />
          <p className="m-0 max-w-[360px]">Picture books where your child is the star.</p>
        </div>
        <nav className="ss-footer__col" aria-label="Shop">
          <span className="ss-footer__label">Shop</span>
          {shop.map((i, k) => (
            <Item key={k} item={i} />
          ))}
        </nav>
        <nav className="ss-footer__col" aria-label="Help">
          <span className="ss-footer__label">Help</span>
          {help.map((i, k) => (
            <Item key={k} item={i} />
          ))}
        </nav>
        <nav className="ss-footer__col" aria-label="About">
          <span className="ss-footer__label">About</span>
          {about.map((i, k) => (
            <Item key={k} item={i} />
          ))}
        </nav>
      </div>
      <div className="ss-container ss-footer__legal">&copy; {new Date().getFullYear()} StoryStar</div>
    </footer>
  );
}
