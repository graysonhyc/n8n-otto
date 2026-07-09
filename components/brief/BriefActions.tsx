"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";

export function BriefActions() {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  async function rescan() {
    setBusy(true);
    toast("Rescanning workflows…");
    const res = await fetch("/api/sync", { method: "POST" });
    const { changed } = await res.json().catch(() => ({ changed: 0 }));
    toast(changed ? `${changed} change(s) detected` : "Scan complete — no new changes");
    setBusy(false);
    router.refresh();
  }

  async function sendToSlack() {
    setBusy(true);
    const res = await fetch("/api/slack/brief", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    toast(res.ok ? `Posted to ${data.channel ?? "Slack"}` : data.error ?? "Slack not connected", {
      variant: res.ok ? "accent" : "danger",
    });
    setBusy(false);
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={rescan}
        disabled={busy}
        className="inline-flex h-8 items-center gap-2 rounded-md border border-line-2 bg-panel-3 px-3 text-[12.5px] font-medium text-ink transition-colors hover:bg-elev disabled:opacity-50"
      >
        <Icon name="rescan" size={14} />
        Rescan
      </button>
      <button
        onClick={sendToSlack}
        disabled={busy}
        className="inline-flex h-8 items-center gap-2 rounded-md border border-accent bg-accent px-3 text-[12.5px] font-semibold text-accent-ink transition hover:brightness-110 disabled:opacity-50"
      >
        <Icon name="send" size={14} />
        Send brief to Slack
      </button>
    </div>
  );
}
