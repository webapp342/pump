import type { Metadata } from "next";
import { TelegramAuthCompleteClient } from "./TelegramAuthCompleteClient";

export const metadata: Metadata = {
  title: "Sign in · Pump",
};

type TelegramAuthCompletePageProps = {
  searchParams: Promise<{ status?: string; message?: string }>;
};

export default async function TelegramAuthCompletePage({
  searchParams,
}: TelegramAuthCompletePageProps) {
  const params = await searchParams;

  return (
    <TelegramAuthCompleteClient
      status={params.status ?? null}
      message={params.message ?? null}
    />
  );
}
