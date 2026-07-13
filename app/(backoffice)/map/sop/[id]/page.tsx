import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shell/AppShell";
import { Chip } from "@/components/ui/Chip";
import { SopDetail } from "@/components/relationships/SopDetail";
import { SopRenameButton } from "@/components/relationships/SopRenameButton";
import { loadSopDetail } from "@/lib/data/map";

export const dynamic = "force-dynamic";

export default async function SopDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await loadSopDetail(id);
  if (!data) notFound();

  return (
    <div className="p-6">
      <Link
        href="/map?view=groups"
        className="mb-3 inline-flex items-center gap-1 text-[12.5px] text-muted transition-colors hover:text-ink"
      >
        ‹ Linked workflows
      </Link>
      <PageHeader
        title={data.sop.name}
        subtitle="Linked workflows"
        actions={
          <div className="flex items-center gap-2">
            <SopRenameButton id={data.sop.id} current={data.sop.name} />
            <Chip>{data.live ? "Live instance" : "Demo data"}</Chip>
          </div>
        }
      />
      <SopDetail sop={data.sop} members={data.members} addable={data.addable} live={data.live} />
    </div>
  );
}
