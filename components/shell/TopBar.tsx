"use client";

import { useRouter, usePathname } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import { OPEN_EVENT } from "./CommandPalette";

function crumb(pathname: string): { root: string; leaf: string } {
  if (pathname.startsWith("/registry")) return { root: "Backoffice", leaf: "Registry" };
  if (pathname.startsWith("/workflow")) return { root: "Registry", leaf: "Workflow" };
  return { root: "Backoffice", leaf: "Brief" };
}

export function TopBar() {
  const router = useRouter();
  const pathname = usePathname();
  const { toast } = useToast();
  const { root, leaf } = crumb(pathname);

  async function rescan() {
    toast("Rescanning workflows…");
    const res = await fetch("/api/sync", { method: "POST" });
    const { changed } = await res.json().catch(() => ({ changed: 0 }));
    toast(changed ? `${changed} change(s) detected` : "Scan complete — no new changes");
    router.refresh();
  }

  return (
    <header className="flex h-[52px] flex-none items-center gap-3.5 border-b border-line bg-panel/60 px-4.5 backdrop-blur-md">
      <div className="flex items-center gap-2 text-[13px] text-muted">
        <span>{root}</span>
        <Icon name="chevron" size={13} className="opacity-50" />
        <b className="font-semibold text-ink">{leaf}</b>
      </div>

      <button
        onClick={() => window.dispatchEvent(new Event(OPEN_EVENT))}
        className="ml-1.5 flex h-[34px] w-full max-w-[440px] flex-1 items-center gap-2.5 rounded-lg border border-line-2 bg-panel-2 px-3 text-[13px] text-faint transition-colors hover:border-[#40434e] hover:bg-panel-3"
      >
        <Icon name="search" size={15} />
        Search workflows, owners, changes…
        <kbd className="ml-auto rounded border border-line-2 border-b-2 bg-panel-3 px-1.5 font-mono text-[11px] text-muted">
          ⌘K
        </kbd>
      </button>

      <div className="flex-1" />

      <div className="flex items-center gap-2 rounded-full border border-line bg-panel-2 px-2.5 py-1.5 text-[12px] text-muted">
        <span className="animate-pulse-dot h-[7px] w-[7px] rounded-full bg-ok" />
        Live scan
      </div>
      <button
        onClick={rescan}
        title="Rescan now"
        className="grid h-[34px] w-[34px] place-items-center rounded-md border border-line-2 bg-panel-2 text-muted transition-colors hover:bg-panel-3 hover:text-ink"
      >
        <Icon name="rescan" size={16} />
      </button>
    </header>
  );
}
