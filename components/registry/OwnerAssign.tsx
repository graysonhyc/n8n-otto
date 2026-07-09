"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { RegistryItem } from "@/lib/derive/registry";
import { Button } from "@/components/ui/Button";
import { SlackChannelPicker, type SlackChannel } from "@/components/ui/SlackChannelPicker";

// Inline ownership cell: shows the confirmed owner, or an "Assign" affordance
// that reads the live Slack channels to pick a routing target.
export function OwnerAssign({ item }: { item: RegistryItem }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [team, setTeam] = useState(item.owner?.team ?? "");
  const [channel, setChannel] = useState<SlackChannel | null>(
    item.owner?.slackChannelId
      ? { id: item.owner.slackChannelId, name: item.owner.slackChannelName ?? "", isMember: true }
      : null,
  );
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!team.trim()) return;
    setSaving(true);
    await fetch("/api/owners", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        workflowId: item.id,
        team: team.trim(),
        slackChannelId: channel?.id ?? null,
        slackChannelName: channel?.name ?? null,
      }),
    });
    setSaving(false);
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return item.owner ? (
      <button onClick={() => setOpen(true)} className="text-left">
        <div className="text-ink">{item.owner.team}</div>
        {item.owner.slackChannelName && (
          <div className="text-[11px] text-accent">{item.owner.slackChannelName}</div>
        )}
      </button>
    ) : (
      <button
        onClick={() => setOpen(true)}
        className="text-[11px] font-semibold text-danger hover:underline"
      >
        Unassigned — assign
      </button>
    );
  }

  return (
    <div className="flex w-56 flex-col gap-2 rounded-lg border border-line-2 bg-panel-2 p-2.5">
      <input
        autoFocus
        value={team}
        onChange={(e) => setTeam(e.target.value)}
        placeholder="Owner team (e.g. Support Ops)"
        className="rounded-md border border-line bg-panel-3 px-2 py-1 text-[12px] text-ink placeholder:text-faint"
      />
      <SlackChannelPicker value={channel?.id ?? null} onChange={setChannel} />
      <div className="flex gap-2">
        <Button variant="primary" onClick={save} disabled={saving || !team.trim()}>
          {saving ? "Saving…" : "Save"}
        </Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
