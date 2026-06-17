import { AppShell } from "@/components/layout/AppShell";
import { AirdropsListClient } from "@/components/airdrops/AirdropsListClient";
import { fetchAirdropsListPayload } from "@/lib/airdrops-server";

export default async function AirdropsPage() {
  let initialPayload = null;
  try {
    initialPayload = await fetchAirdropsListPayload();
  } catch {
    // Client retries on hydration.
  }

  return (
    <AppShell>
      <AirdropsListClient initialPayload={initialPayload} />
    </AppShell>
  );
}
