import "./admin.css";
import { AppShell } from "@/components/layout/AppShell";
import { AdminGate } from "@/components/admin/AdminGate";
import { AdminPanel } from "@/components/admin/AdminPanel";

export default function AdminPage() {
  return (
    <AppShell>
      <AdminGate>
        <AdminPanel />
      </AdminGate>
    </AppShell>
  );
}
