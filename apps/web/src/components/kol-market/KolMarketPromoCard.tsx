"use client";

import Link from "next/link";
import { PumpIcon, faArrowRight, faCrown } from "@/lib/icons";
import { KOL_MARKET_COPY } from "@/lib/kol-market-copy";

export function KolMarketPromoCard() {
  return (
    <Link href="/kol-market" className="kol-market-promo panel-interactive">
      <span className="kol-market-promo__icon" aria-hidden>
        <PumpIcon icon={faCrown} size="lg" />
      </span>
      <span className="kol-market-promo__copy">
        <span className="card-title">{KOL_MARKET_COPY.pageTitle}</span>
        <span className="text-body-sm text-pump-muted">{KOL_MARKET_COPY.pageDescription}</span>
      </span>
      <PumpIcon icon={faArrowRight} className="kol-market-promo__arrow" aria-hidden />
    </Link>
  );
}
