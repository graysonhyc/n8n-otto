"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { RegistryItem } from "@/lib/derive/registry";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { SlackChannelPicker, type SlackChannel } from "@/components/ui/SlackChannelPicker";

// Inline channel cell: shows the routed Slack channel, or an "Assign" affordance
// that reads the live Slack channels to pick one. The chosen channel *is* the
// ownership — its name is persisted as the owner "team" so downstream routing
// (brief, Slack, Linear) keeps working unchanged.
export function OwnerAssign({ item }: { item: RegistryItem }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [channel, setChannel] = useState<SlackChannel | null>(
    item.owner?.slackChannelId
      ? { id: item.owner.slackChannelId, name: item.owner.slackChannelName ?? "", isMember: true }
      : null,
  );
  const [saving, setSaving] = useState(false);

  async function post(body: Record<string, unknown>) {
    setSaving(true);
    await fetch("/api/owners", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    setSaving(false);
    setOpen(false);
    router.refresh();
  }

  async function save() {
    if (!channel) return;
    // The channel name doubles as the routing key ("team") downstream.
    await post({
      workflowId: item.id,
      team: channel.name,
      slackChannelId: channel.id,
      slackChannelName: channel.name,
    });
  }

  if (!open) {
    if (item.owner) {
      const label = (item.owner.slackChannelName ?? item.owner.team).replace(/^#+/, "");
      return (
        <button onClick={() => setOpen(true)} title="Edit channel" className="group text-left">
          <span className="flex items-center gap-1.5 text-accent">
            #{label}
            <Icon
              name="pencil"
              size={12}
              className="shrink-0 text-faint transition-colors group-hover:text-muted"
            />
          </span>
        </button>
      );
    }

    if (item.suggestedOwner) {
      const { team: sTeam, confidence } = item.suggestedOwner;
      return (
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] uppercase tracking-wide text-faint">Likely</span>
            <span className="text-ink">{sTeam}</span>
            <span
              className={`rounded px-1 py-px text-[9.5px] uppercase tracking-wide ${
                confidence === "high"
                  ? "bg-accent-dim text-accent"
                  : "bg-panel-3 text-muted"
              }`}
            >
              {confidence}
            </span>
          </div>
          <button
            onClick={() => setOpen(true)}
            className="self-start text-[11px] font-semibold text-danger hover:underline"
          >
            Set channel
          </button>
        </div>
      );
    }

    return (
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
      <SlackChannelPicker value={channel?.id ?? null} onChange={setChannel} />
      <div className="flex gap-2">
        <Button variant="primary" onClick={save} disabled={saving || !channel}>
          {saving ? "Saving…" : "Save"}
        </Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
