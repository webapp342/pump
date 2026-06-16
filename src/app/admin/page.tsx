import "./admin.css";
import { AppShell } from "@/components/layout/AppShell";
import { PageBackLink } from "@/components/ui/PageBackLink";
import { AdminGate } from "@/components/admin/AdminGate";
import { AdminPanel } from "@/components/admin/AdminPanel";

export default function AdminPage() {
  return (
    <AppShell>
      <AdminGate>
        <div className="space-y-3 md:space-y-4">
          <PageBackLink href="/" />
          <AdminPanel />
        </div>
      </AdminGate>
    </AppShell>
  );
}
