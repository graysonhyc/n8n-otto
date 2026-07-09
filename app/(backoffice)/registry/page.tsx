import { PageHeader } from "@/components/shell/AppShell";

export default function RegistryPage() {
  return (
    <div className="p-5">
      <PageHeader
        title="Automation Registry"
        subtitle="What is running and what it does"
      />
      <p className="text-sm text-muted">Inventory table lands here (Chunk 2).</p>
    </div>
  );
}
