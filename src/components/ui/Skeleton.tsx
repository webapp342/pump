type SkeletonProps = {
  className?: string;
  /** block = panels/chips, circle = avatars, line = labels */
  variant?: "block" | "circle" | "line";
};

export function Skeleton({ className = "", variant = "block" }: SkeletonProps) {
  const radius =
    variant === "circle" ? "rounded-full" : variant === "line" ? "rounded-sm" : "rounded-md";

  return <div className={`skeleton-shimmer ${radius} ${className}`} aria-hidden />;
}
