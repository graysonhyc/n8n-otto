import { PageHeader } from "@/components/shell/AppShell";
import { BriefBoard } from "@/components/brief/BriefBoard";
import { BriefActions } from "@/components/brief/BriefActions";
import { loadBrief } from "@/lib/data/brief";

export const dynamic = "force-dynamic";

export default async function BriefPage() {
  const { items, scanned } = await loadBrief();
  const high = items.filter((i) => i.severity === "high").length;

  return (
    <div className="p-6">
      <PageHeader
        title="Backoffice Brief"
        subtitle={
          items.length ? (
            <>
              <b className="font-semibold text-ink nums">{items.length}</b> items need attention ·{" "}
              <b className="font-semibold text-ink nums">{high}</b> high ·{" "}
              <b className="font-semibold text-ink nums">{scanned}</b> workflows scanned
            </>
          ) : (
            <>
              Nothing needs attention · <b className="font-semibold text-ink nums">{scanned}</b>{" "}
              workflows scanned
            </>
          )
        }
        actions={<BriefActions />}
      />
      <BriefBoard items={items} scanned={scanned} />
    </div>
  );
}
