"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { TokenListItem } from "@/lib/db/launchpad";
import { TokenAvatar } from "@/components/token/TokenAvatar";
import { IconLabel } from "@/components/ui/IconLabel";
import { MetricIcons } from "@/lib/metric-icons";
import { PctChange } from "@/components/ui/PctChange";

const MCAP_TICKER_LIMIT = 20;
const TICKER_LOOP_MS = 40_000;

type ArenaMcapTickerProps = {
  tokens: TokenListItem[];
};

function TickerItem({ token }: { token: TokenListItem }) {
  const symbolLabel = `$${token.symbol}`;

  return (
    <Link href={`/token/${token.address}`} className="mcap-ticker-item">
      <TokenAvatar
        address={token.address}
        symbol={token.symbol}
        logoUrl={token.logoUrl}
        size="xs"
      />
      <span className="mcap-ticker-symbol">{symbolLabel}</span>
      <PctChange value={token.change24hPct ?? null} className="mcap-ticker-pct" />
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

function readTrackGap(track: HTMLElement): number {
  const style = getComputedStyle(track);
  const gapValue = style.columnGap || style.gap || "0px";
  return Number.parseFloat(gapValue) || 0;
}

/** One loop = first segment width + flex gap (Safari-safe vs offsetLeft between segments). */
function measureLoopShift(segment: HTMLElement | null): number {
  if (!segment) return 0;

  const track = segment.parentElement;
  if (!track) return 0;

  const width =
    segment.offsetWidth ||
    segment.scrollWidth ||
    segment.getBoundingClientRect().width;

  if (width <= 0) return 0;
  return Math.round(width + readTrackGap(track));
}

function setTrackTranslate(track: HTMLElement, offsetPx: number) {
  const value = `translate3d(${-offsetPx}px, 0, 0)`;
  track.style.transform = value;
  track.style.webkitTransform = value;
}

export function ArenaMcapTicker({ tokens }: ArenaMcapTickerProps) {
  const [reducedMotion, setReducedMotion] = useState(false);
  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const segmentRef = useRef<HTMLDivElement>(null);
  const segmentDupRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
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
      setShiftPx(0);
      return;
    }

    const viewport = viewportRef.current;
    const measure = measureRef.current;
    if (!viewport || !measure || topTokens.length === 0) return;

    const syncLoopTokens = () => {
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

    syncLoopTokens();
    const ro = new ResizeObserver(syncLoopTokens);
    ro.observe(viewport);
    ro.observe(measure);
    return () => ro.disconnect();
  }, [topTokens, reducedMotion]);

  useLayoutEffect(() => {
    if (reducedMotion || loopTokens.length === 0) {
      setShiftPx(0);
      return;
    }

    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];

    const measureLoop = () => {
      if (cancelled) return;

      const first = segmentRef.current;
      const shift = measureLoopShift(first);

      if (shift > 0) {
        setShiftPx((prev) => (prev === shift ? prev : shift));
        return true;
      }

      return false;
    };

    const scheduleRetries = () => {
      if (measureLoop()) return;

      [0, 50, 120, 300, 600, 1200].forEach((delay) => {
        timers.push(
          setTimeout(() => {
            measureLoop();
          }, delay)
        );
      });
    };

    measureLoop();
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        scheduleRetries();
      });
    });

    const ro = new ResizeObserver(() => {
      measureLoop();
    });

    if (segmentRef.current) ro.observe(segmentRef.current);
    if (segmentDupRef.current) ro.observe(segmentDupRef.current);
    if (viewportRef.current) ro.observe(viewportRef.current);

    const segment = segmentRef.current;
    const dup = segmentDupRef.current;
    const onImageLoad = () => measureLoop();
    const images = [
      ...(segment ? Array.from(segment.querySelectorAll("img")) : []),
      ...(dup ? Array.from(dup.querySelectorAll("img")) : []),
    ];
    images.forEach((img) => {
      if (img.complete) return;
      img.addEventListener("load", onImageLoad, { once: true });
      img.addEventListener("error", onImageLoad, { once: true });
    });

    window.addEventListener("load", onImageLoad);

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
      ro.disconnect();
      window.removeEventListener("load", onImageLoad);
      images.forEach((img) => {
        img.removeEventListener("load", onImageLoad);
        img.removeEventListener("error", onImageLoad);
      });
    };
  }, [loopTokens, reducedMotion]);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    const stop = () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      track.style.transform = "";
      track.style.webkitTransform = "";
    };

    stop();

    if (reducedMotion || shiftPx <= 0) return;

    let running = true;
    let lastTime = performance.now();
    let offset = 0;
    const pxPerMs = shiftPx / TICKER_LOOP_MS;

    const tick = (now: number) => {
      if (!running) return;

      const delta = Math.min(now - lastTime, 64);
      lastTime = now;
      offset += delta * pxPerMs;

      if (offset >= shiftPx) {
        offset %= shiftPx;
      }

      setTrackTranslate(track, offset);
      rafRef.current = requestAnimationFrame(tick);
    };

    const start = () => {
      lastTime = performance.now();
      rafRef.current = requestAnimationFrame(tick);
    };

    start();

    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        stop();
        offset = 0;
        start();
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        stop();
        return;
      }
      stop();
      offset = 0;
      start();
    };

    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      running = false;
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("visibilitychange", onVisibility);
      stop();
    };
  }, [shiftPx, reducedMotion]);

  if (topTokens.length === 0) return null;

  const loopReady = !reducedMotion && loopTokens.length > 0 && shiftPx > 0;

  return (
    <div className="mcap-ticker-row scroll-strip-row" role="region" aria-label="Top market cap tokens">
      <IconLabel
        icon={MetricIcons.mcap}
        hideIconMobile
        className="section-label mcap-ticker-label shrink-0 text-caption md:text-[inherit]"
      >
        Top MC
      </IconLabel>
      <div
        className={`mcap-ticker${reducedMotion ? " mcap-ticker-static" : ""}`}
      >
        <div className="sr-only" aria-live="off">
          Top tokens by market cap:{" "}
          {topTokens.map((token) => `$${token.symbol}`).join(", ")}
        </div>
        <div ref={viewportRef} className="mcap-ticker-viewport">
          <div ref={measureRef} className="mcap-ticker-measure" aria-hidden>
            {topTokens.map((token) => (
              <TickerItem key={`measure-${token.address}`} token={token} />
            ))}
          </div>
          <div
            ref={trackRef}
            className={`mcap-ticker-track${loopReady ? " mcap-ticker-track--active" : ""}`}
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
    </div>
  );
}
