import { pctTone } from "@/lib/arena-board-format";

type PctChangeProps = {
  value: number | null | undefined;
  className?: string;
  decimals?: number;
  /** Override automatic success/danger tone */
  toneClassName?: string;
  /** Omit render when value is missing (no em dash). */
  hideWhenEmpty?: boolean;
};

export function PctChange({
  value,
  className = "",
  decimals = 2,
  toneClassName,
  hideWhenEmpty = false,
}: PctChangeProps) {
  if (value == null || !Number.isFinite(value)) {
    if (hideWhenEmpty) return null;
    return <span className={`financial-value ${className}`}>—</span>;
  }

  const up = value >= 0;
  const tone = toneClassName ?? pctTone(value);

  return (
    <span className={`financial-value inline-flex items-baseline gap-[0.2em] leading-none ${tone} ${className}`}>
      <span
        className={`pct-change-arrow ${up ? "pct-change-arrow--up" : "pct-change-arrow--down"}`}
        aria-hidden
      />
      <span>{Math.abs(value).toFixed(decimals)}%</span>
    </span>
  );
}
