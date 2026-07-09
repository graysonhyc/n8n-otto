import { PageHeader } from "@/components/shell/AppShell";
import { BriefCard } from "@/components/brief/BriefCard";
import { BriefActions } from "@/components/brief/BriefActions";
import { loadBrief } from "@/lib/data/brief";

export const dynamic = "force-dynamic";

export default async function BriefPage() {
  const { items, scanned } = await loadBrief();
  const high = items.filter((i) => i.severity === "high").length;

  return (
    <div className="p-5">
      <PageHeader
        title="Backoffice Brief"
        subtitle={
          items.length
            ? `${items.length} item(s) need attention · ${high} high · ${scanned} workflows scanned`
            : `Nothing needs attention · ${scanned} workflows scanned`
        }
        actions={<BriefActions />}
      />

      {items.length === 0 ? (
        <div className="rounded-xl border border-line bg-panel-2 p-10 text-center text-sm text-muted">
          All clear. No risky changes, ownership gaps, or shared-resource risks right now.
        </div>
      ) : (
        <div className="flex max-w-3xl flex-col gap-3">
          {items.map((item) => (
            <BriefCard key={item.key} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
