"use client";

import { useEffect, useState, type RefObject } from "react";

const CHIP_GAP_PX = 6;
const CHIP_WIDTH_ESTIMATE_PX = 96;

export function useFitTokenChipCount(
  scrollRef: RefObject<HTMLDivElement | null>,
  maxTokens: number,
  enabled: boolean
) {
  const [count, setCount] = useState(maxTokens);

  useEffect(() => {
    if (!enabled) {
      setCount(maxTokens);
      return;
    }

    const node = scrollRef.current;
    if (!node) return;

    const update = () => {
      const width = node.clientWidth;
      if (width <= 0) {
        setCount(maxTokens);
        return;
      }

      const chip = node.querySelector<HTMLElement>(".token-favorites-strip__chip");
      const chipWidth = chip?.offsetWidth ?? CHIP_WIDTH_ESTIMATE_PX;
      const fit = Math.max(1, Math.floor((width + CHIP_GAP_PX) / (chipWidth + CHIP_GAP_PX)));
      setCount(Math.min(maxTokens, fit));
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    if (node.firstElementChild) {
      observer.observe(node.firstElementChild);
    }

    return () => observer.disconnect();
  }, [enabled, maxTokens, scrollRef]);

  return count;
}
