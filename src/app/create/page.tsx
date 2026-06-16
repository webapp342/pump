import { AppShell } from "@/components/layout/AppShell";
import { PageBackLink } from "@/components/ui/PageBackLink";
import { CreateMemeForm } from "@/components/create/CreateMemeForm";

export default function CreatePage() {
  return (
    <AppShell>
      <div className="space-y-3 md:space-y-4">
        <PageBackLink href="/" />
        <CreateMemeForm />
      </div>
    </AppShell>
  );
}
