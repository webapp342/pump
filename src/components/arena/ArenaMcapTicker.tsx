"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { TokenListItem } from "@/lib/db/launchpad";
import { TokenAvatar } from "@/components/token/TokenAvatar";
import { formatSignedPct, pctTone } from "@/lib/arena-board-format";

const MCAP_TICKER_LIMIT = 20;

type ArenaMcapTickerProps = {
  tokens: TokenListItem[];
};

function TickerItem({ token }: { token: TokenListItem }) {
  return (
    <Link href={`/token/${token.address}`} className="mcap-ticker-item">
      <TokenAvatar
        address={token.address}
        symbol={token.symbol}
        logoUrl={token.logoUrl}
        size={18}
      />
      <span className="mcap-ticker-symbol">${token.symbol}</span>
      <span
        className={`financial-value mcap-ticker-pct ${pctTone(token.change24hPct ?? null)}`}
      >
        {formatSignedPct(token.change24hPct ?? null)}
      </span>
    </Link>
  );
}

function repeatTokens(source: TokenListItem[], repeats: number): TokenListItem[] {
  const out: TokenListItem[] = [];
  for (let i = 0; i < repeats; i += 1) {
    out.push(...source);
  }
  return out;
}

export function ArenaMcapTicker({ tokens }: ArenaMcapTickerProps) {
  const [reducedMotion, setReducedMotion] = useState(false);
  const viewportRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const segmentRef = useRef<HTMLDivElement>(null);
  const segmentDupRef = useRef<HTMLDivElement>(null);
  const [loopTokens, setLoopTokens] = useState<TokenListItem[]>([]);
  const [shiftPx, setShiftPx] = useState(0);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const topTokens = useMemo(() => tokens.slice(0, MCAP_TICKER_LIMIT), [tokens]);

  useLayoutEffect(() => {
    if (reducedMotion) {
      setLoopTokens(topTokens);
      return;
    }

    const viewport = viewportRef.current;
    const measure = measureRef.current;
    if (!viewport || !measure || topTokens.length === 0) return;

    const sync = () => {
      const unitWidth = measure.scrollWidth;
      const viewportWidth = viewport.clientWidth;
      if (unitWidth <= 0 || viewportWidth <= 0) {
        setLoopTokens(topTokens);
        return;
      }

      let repeats = 1;
      while (unitWidth * repeats < viewportWidth) {
        repeats += 1;
      }

      setLoopTokens(repeatTokens(topTokens, repeats));
    };

    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(viewport);
    ro.observe(measure);
    return () => ro.disconnect();
  }, [topTokens, reducedMotion]);

  useLayoutEffect(() => {
    if (reducedMotion || loopTokens.length === 0) return;

    const measureLoop = () => {
      const first = segmentRef.current;
      const second = segmentDupRef.current;
      if (!first || !second) return;
      const shift = second.offsetLeft - first.offsetLeft;
      if (shift > 0) setShiftPx(shift);
    };

    measureLoop();
    const ro = new ResizeObserver(measureLoop);
    if (segmentRef.current) ro.observe(segmentRef.current);
    if (segmentDupRef.current) ro.observe(segmentDupRef.current);
    return () => ro.disconnect();
  }, [loopTokens, reducedMotion]);

  if (topTokens.length === 0) return null;

  const loopReady = !reducedMotion && loopTokens.length > 0 && shiftPx > 0;
  const trackStyle = loopReady
    ? ({ "--mcap-ticker-shift": `-${shiftPx}px` } as React.CSSProperties)
    : undefined;

  return (
    <div
      className={`mcap-ticker${reducedMotion ? " mcap-ticker-static" : ""}`}
      role="region"
      aria-label="Top market cap tokens"
    >
      <div className="sr-only" aria-live="off">
        Top tokens by market cap:{" "}
        {topTokens.map((token) => `$${token.symbol}`).join(", ")}
      </div>
      <div ref={viewportRef} className="mcap-ticker-viewport" aria-hidden={!reducedMotion}>
        <div ref={measureRef} className="mcap-ticker-measure" aria-hidden>
          {topTokens.map((token) => (
            <TickerItem key={`measure-${token.address}`} token={token} />
          ))}
        </div>
        <div
          className={`mcap-ticker-track${loopReady ? " mcap-ticker-track--ready" : ""}`}
          style={trackStyle}
        >
          <div ref={segmentRef} className="mcap-ticker-segment">
            {(loopTokens.length > 0 ? loopTokens : topTokens).map((token, index) => (
              <TickerItem key={`a-${token.address}-${index}`} token={token} />
            ))}
          </div>
          {reducedMotion ? null : (
            <div ref={segmentDupRef} className="mcap-ticker-segment" aria-hidden>
              {(loopTokens.length > 0 ? loopTokens : topTokens).map((token, index) => (
                <TickerItem key={`b-${token.address}-${index}`} token={token} />
              ))}
            </div>
          )}
        </div>
      </div>
      {reducedMotion ? (
        <div className="mcap-ticker-static-row">
          {topTokens.map((token) => (
            <TickerItem key={token.address} token={token} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
