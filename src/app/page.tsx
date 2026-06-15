import { AppShell } from "@/components/layout/AppShell";
import { ArenaListClient } from "@/components/arena/ArenaListClient";

export default function HomePage() {
  return (
    <AppShell>
      <ArenaListClient />
    </AppShell>
  );
}
