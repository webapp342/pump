type AirdropGuaranteedBadgeProps = {
  className?: string;
};

export function AirdropGuaranteedBadge({ className = "" }: AirdropGuaranteedBadgeProps) {
  return (
    <span
      className={`status-badge shrink-0 border-pump-success/40 bg-pump-success/10 text-[10px] text-pump-success ${className}`}
    >
      100% guaranteed
    </span>
  );
}
