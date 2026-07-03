import {
  CYCLOPS_LOGOGRAM_PATHS,
  CYCLOPS_LOGOGRAM_VIEWBOX,
  CYCLOPS_LOGOTYPE_TRANSFORM,
  CYCLOPS_WORD_PATH,
  CYCLOPS_WORD_VIEWBOX,
} from "@/lib/cyclops-logo";

type CyclopsLogoProps = {
  /** Full lockup (logogram + wordmark) on all breakpoints unless logogram-only. */
  variant?: "lockup" | "logogram" | "auto";
  className?: string;
};

function CyclopsLogogramSvg({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox={CYCLOPS_LOGOGRAM_VIEWBOX}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`cyclops-logo__svg cyclops-logo__svg--logogram ${className}`.trim()}
      aria-hidden
    >
      {CYCLOPS_LOGOGRAM_PATHS.map((d, index) => (
        <path key={index} className="cyclops-logo__accent" d={d} />
      ))}
    </svg>
  );
}

function CyclopsWordmarkSvg({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox={CYCLOPS_WORD_VIEWBOX}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`cyclops-logo__svg cyclops-logo__svg--wordmark ${className}`.trim()}
      aria-hidden
    >
      <g transform={CYCLOPS_LOGOTYPE_TRANSFORM}>
        <path className="cyclops-logo__logotype" d={CYCLOPS_WORD_PATH} />
      </g>
    </svg>
  );
}

function CyclopsLockup({ className = "" }: { className?: string }) {
  return (
    <span className={`cyclops-logo cyclops-logo--lockup ${className}`.trim()}>
      <CyclopsLogogramSvg />
      <CyclopsWordmarkSvg />
    </span>
  );
}

export function CyclopsLogo({ variant = "auto", className = "" }: CyclopsLogoProps) {
  if (variant === "lockup" || variant === "auto") {
    return <CyclopsLockup className={className} />;
  }

  return (
    <span className={`cyclops-logo cyclops-logo--logogram-only ${className}`.trim()}>
      <CyclopsLogogramSvg />
    </span>
  );
}
