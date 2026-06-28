"use client";

import { useEffect, useState, type RefObject } from "react";

export function useTokenSidebarHeadAnchor(
  gridRef: RefObject<HTMLElement | null>,
  headWrapRef: RefObject<HTMLElement | null>,
  remeasureKey: string | number = 0
) {
  const [top, setTop] = useState<number | null>(null);

  useEffect(() => {
    const grid = gridRef.current;
    const head = headWrapRef.current;
    if (!grid || !head) return;

    const measure = () => {
      const gridRect = grid.getBoundingClientRect();
      const headRect = head.getBoundingClientRect();
      setTop(headRect.top - gridRect.top + headRect.height / 2);
    };

    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(grid);
    observer.observe(head);

    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [gridRef, headWrapRef, remeasureKey]);

  return top;
}
