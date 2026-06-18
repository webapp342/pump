import { Suspense } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { PortfolioPageLoader } from "@/components/portfolio/PortfolioPageLoader";
import { PortfolioPanelSkeleton } from "@/components/portfolio/PortfolioPanelSkeleton";

type PortfolioPageProps = {
  searchParams: Promise<{ address?: string }>;
};

export default function PortfolioPage({ searchParams }: PortfolioPageProps) {
  return (
    <AppShell>
      <Suspense fallback={<PortfolioPanelSkeleton />}>
        <PortfolioPageLoader searchParams={searchParams} />
      </Suspense>
    </AppShell>
  );
}
