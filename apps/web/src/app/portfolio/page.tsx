import { Suspense } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { PortfolioAuthGate } from "@/components/portfolio/PortfolioAuthGate";
import { PortfolioPageLoader } from "@/components/portfolio/PortfolioPageLoader";
import { PortfolioPanelSkeleton } from "@/components/portfolio/PortfolioPanelSkeleton";

type PortfolioPageProps = {
  searchParams: Promise<{ address?: string; tab?: string }>;
};

export default function PortfolioPage({ searchParams }: PortfolioPageProps) {
  return (
    <AppShell>
      <PortfolioAuthGate>
        <Suspense fallback={<PortfolioPanelSkeleton />}>
          <PortfolioPageLoader searchParams={searchParams} />
        </Suspense>
      </PortfolioAuthGate>
    </AppShell>
  );
}
