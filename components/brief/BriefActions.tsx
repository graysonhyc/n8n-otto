"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";

export function BriefActions() {
  const router = useRouter();
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    setBusy(true);
    setStatus("Syncing…");
    const res = await fetch("/api/sync", { method: "POST" });
    const { changed } = await res.json();
    setStatus(changed ? `${changed} change(s) detected` : "No new changes");
    setBusy(false);
    router.refresh();
  }

  async function sendToSlack() {
    setBusy(true);
    setStatus("Posting to Slack…");
    const res = await fetch("/api/slack/brief", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setStatus(
      res.ok
        ? `Sent to ${data.channel ?? "Slack"} ✓`
        : data.error ?? "Slack not connected",
    );
    setBusy(false);
  }

  return (
    <div className="flex items-center gap-2">
      {status && <span className="text-[11px] text-muted">{status}</span>}
      <Button variant="ghost" onClick={refresh} disabled={busy}>
        Refresh
      </Button>
      <Button variant="primary" onClick={sendToSlack} disabled={busy}>
        Send to Slack
      </Button>
    </div>
  );
}
