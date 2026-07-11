import type { Metadata } from "next";
import { OAuthAuthCompleteClient } from "./OAuthAuthCompleteClient";

export const metadata: Metadata = {
  title: "Sign in · Pump",
};

export const dynamic = "force-dynamic";

type OAuthAuthCompletePageProps = {
  searchParams: Promise<{ status?: string; message?: string; provider?: string }>;
};

export default async function OAuthAuthCompletePage({
  searchParams,
}: OAuthAuthCompletePageProps) {
  const params = await searchParams;

  return (
    <OAuthAuthCompleteClient
      status={params.status ?? null}
      message={params.message ?? null}
      provider={params.provider ?? null}
    />
  );
}
