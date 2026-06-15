import { Skeleton } from "@/components/ui/Skeleton";

export function PageIntroSkeleton() {
  return (
    <div className="page-intro" aria-hidden>
      <Skeleton className="h-3 w-20" />
      <Skeleton className="mt-1 h-7 w-36 max-w-[70%]" />
      <Skeleton className="mt-1 h-4 w-full max-w-md" />
    </div>
  );
}
