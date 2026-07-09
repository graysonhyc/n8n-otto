import { PageHeader } from "@/components/shell/AppShell";

export default function BriefPage() {
  return (
    <div className="p-5">
      <PageHeader
        title="Backoffice Brief"
        subtitle="What needs attention now"
      />
      <p className="text-sm text-muted">Brief cards land here (Chunk 3).</p>
    </div>
  );
}
