"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

/** The credit balance in the header. Refreshes on every page change (the header itself isn't re-rendered). */
export function CreditBadge({ initial }: { initial: number }) {
  const [balance, setBalance] = useState(initial);
  const path = usePathname();
  useEffect(() => {
    let stop = false;
    fetch("/api/credits", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { balanceUsd?: number } | null) => {
        if (!stop && typeof j?.balanceUsd === "number") setBalance(j.balanceUsd);
      })
      .catch(() => undefined);
    return () => {
      stop = true;
    };
  }, [path]);
  return (
    <Link href="/credits" className="hover:text-cobalt" data-testid="credit-balance">
      Credits <span className={`ml-1 rounded-full px-2 py-0.5 text-sm font-semibold ${balance < 1 ? "bg-coral text-white" : "bg-mint/25 text-olive"}`}>${balance.toFixed(2)}</span>
    </Link>
  );
}
