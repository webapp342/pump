import { forwardRef } from "react";
import type { LucideProps } from "lucide-react";

/** Parachute glyph — airdrop / token drop metaphor (Lucide-compatible for nav). */
export const AirdropParachute = forwardRef<SVGSVGElement, LucideProps>(
  function AirdropParachute({ size = 24, className, color, ...rest }, ref) {
    const dimension = typeof size === "number" ? size : 24;

    return (
      <svg
        ref={ref}
        width={dimension}
        height={dimension}
        viewBox="0 0 16 16"
        fill="none"
        className={className}
        color={color}
        aria-hidden
        {...rest}
      >
        <path
          d="M2.5 6.25C2.5 6.25 4.75 3.25 8 3.25C11.25 3.25 13.5 6.25 13.5 6.25"
          stroke="currentColor"
          strokeWidth="1.35"
          strokeLinecap="round"
        />
        <path
          d="M4.2 6.4L6.35 10.15M8 6.3V10.15M11.8 6.4L9.65 10.15"
          stroke="currentColor"
          strokeWidth="1.15"
          strokeLinecap="round"
        />
        <rect
          x="6.1"
          y="10.15"
          width="3.8"
          height="2.35"
          rx="0.55"
          stroke="currentColor"
          strokeWidth="1.15"
        />
      </svg>
    );
  }
);
