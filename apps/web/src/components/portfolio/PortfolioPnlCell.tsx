"use client";

import { PctChange } from "@/components/ui/PctChange";
import { formatUsdReadable } from "@/lib/format-usd";

function pnlTone(value: number): string {
  if (value > 0) return "text-pump-success";
  if (value < 0) return "text-pump-danger";
  return "text-pump-text";
}

export function PnlCell({
  usd,
  pct,
  align = "end",
}: {
  usd: number | null;
  pct: number | null;
  align?: "start" | "end";
}) {
  const tone = pct != null && Number.isFinite(pct) ? pnlTone(pct) : "text-pump-muted";
  return (
    <div
      className={`flex items-center gap-2 whitespace-nowrap ${align === "start" ? "justify-start" : "justify-end"}`}
    >
      <span className={`financial-value text-caption font-medium ${tone}`}>
        {formatUsdReadable(usd, { compact: true, signed: true })}
      </span>
      <PctChange
        value={pct}
        className="text-caption font-medium"
        toneClassName={tone}
      />
    </div>
  );
}
